import { type Connector } from './run'

/**
 * A connector that reads: a pack keeps a copy of another service's list by an effect move whose
 * payload names what to read. One configured service, its key in a header that never leaves the
 * core; every page of an `{items, total}` answer (`skip` and `limit` in the query); and only the
 * items whose fields equal the payload's `keep`. It answers `{ items }`.
 */
export interface FeedConfig {
  /** The service's origin, e.g. `https://example.com`. The payload's path cannot leave it. */
  url: string
  header: string
  key: string
  fetchImpl?: typeof fetch
}

interface FeedPayload {
  path: string
  query: Record<string, string | string[]>
  keep: Record<string, string>
}

/** The most items a page asks for, and the most pages one read takes. */
const PAGE = 500
const MAX_PAGES = 40
/** The longest one page and the whole read may take: under the effect's 30 seconds. */
const PAGE_MS = 15_000
const READ_MS = 25_000

function payloadOf(value: unknown): FeedPayload {
  const p = value as Partial<FeedPayload> | null
  if (!p || typeof p.path !== 'string' || !/^\/[A-Za-z0-9/_.-]*$/.test(p.path)) {
    throw new Error('a feed payload names a path')
  }
  if (p.path.includes('//') || p.path.includes('..'))
    throw new Error('a feed path stays on its service')
  const strings = (v: unknown) =>
    typeof v === 'string' || (Array.isArray(v) && v.every((s) => typeof s === 'string'))
  const query = p.query ?? {}
  if (typeof query !== 'object' || !Object.values(query).every(strings)) {
    throw new Error('a feed query holds text')
  }
  const keep = p.keep ?? {}
  if (typeof keep !== 'object' || !Object.values(keep).every((v) => typeof v === 'string')) {
    throw new Error('a feed keep holds text')
  }
  return { path: p.path, query, keep }
}

export function feedConnector(config: FeedConfig): Connector {
  const base = new URL(config.url)
  const doFetch = config.fetchImpl ?? globalThis.fetch
  return {
    async send({ payload }) {
      const { path, query, keep } = payloadOf(payload)
      const deadline = AbortSignal.timeout(READ_MS)
      const items: unknown[] = []
      let skip = 0
      for (let page = 0; ; page++) {
        if (page === MAX_PAGES) throw new Error(`the feed has more than ${MAX_PAGES} pages`)
        const url = new URL(base.pathname.replace(/\/+$/, '') + path, base)
        if (url.origin !== base.origin) throw new Error('a feed path stays on its service')
        for (const [name, value] of Object.entries(query)) {
          for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(name, v)
        }
        url.searchParams.set('skip', String(skip))
        url.searchParams.set('limit', String(PAGE))
        // No redirect: fetch would carry the key header to wherever it points. Each page has its
        // own time, and the read stops before the effect's 30 seconds, so nothing reads on after.
        const res = await doFetch(url, {
          headers: { accept: 'application/json', [config.header]: config.key },
          redirect: 'error',
          signal: AbortSignal.any([AbortSignal.timeout(PAGE_MS), deadline]),
        })
        if (!res.ok) {
          await res.body?.cancel()
          const why =
            res.status === 401 || res.status === 403
              ? 'it refused the key'
              : res.status === 429
                ? 'too many requests'
                : `HTTP ${res.status}`
          throw new Error(`the feed answered ${res.status}: ${why}`)
        }
        const body = (await res.json().catch(() => null)) as {
          items?: unknown
          total?: unknown
        } | null
        if (!body || !Array.isArray(body.items) || typeof body.total !== 'number') {
          throw new Error('the feed answered with an unexpected shape')
        }
        items.push(...body.items)
        skip += body.items.length
        // An empty page stops too, or a total the pages never reach would read to the limit.
        if (body.items.length === 0 || skip >= body.total) break
      }
      const kept = items.filter((item) =>
        Object.entries(keep).every(
          ([field, want]) =>
            item !== null &&
            typeof item === 'object' &&
            String((item as Record<string, unknown>)[field] ?? '').toLowerCase() ===
              want.toLowerCase(),
        ),
      )
      return { items: kept }
    },
  }
}
