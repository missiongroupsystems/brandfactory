import { describe, expect, it } from 'vitest'
import { feedConnector } from './feeds'

/** A service that answers each request from `pages`, and keeps the URLs and headers it saw. */
function service(answer: (url: URL) => { status?: number; body: unknown }) {
  const seen: { url: URL; headers: Record<string, string>; init?: RequestInit }[] = []
  const fetchImpl = (async (input: URL, init?: RequestInit) => {
    const url = new URL(input)
    seen.push({ url, headers: init?.headers as Record<string, string>, init })
    const { status = 200, body } = answer(url)
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }) as typeof fetch
  return { seen, fetchImpl }
}

const send = (c: ReturnType<typeof feedConnector>, payload: unknown) =>
  c.send({ pack: 'p', op: 'o', payload })

describe('the feed connector', () => {
  it('reads every page, sends the key in its header and the query as given', async () => {
    const all = Array.from({ length: 7 }, (_, i) => ({ id: String(i), outlet_id: 'A' }))
    const s = service((url) => {
      const skip = Number(url.searchParams.get('skip'))
      // Pages of three, whatever the limit asked: the total, not the limit, decides when to stop.
      return { body: { items: all.slice(skip, skip + 3), total: 7, skip, limit: 3 } }
    })
    const c = feedConnector({
      url: 'https://feed.example.com',
      header: 'X-Key',
      key: 'secret',
      fetchImpl: s.fetchImpl,
    })
    const out = await send(c, {
      path: '/v1/list',
      query: { from: '2026-10-01', status: ['a', 'b'] },
    })
    expect((out as { items: unknown[] }).items).toEqual(all)
    expect(s.seen.map((r) => r.url.searchParams.get('skip'))).toEqual(['0', '3', '6'])
    expect(s.seen[0]!.url.pathname).toBe('/v1/list')
    expect(s.seen[0]!.url.searchParams.getAll('status')).toEqual(['a', 'b'])
    expect(s.seen[0]!.url.searchParams.get('from')).toBe('2026-10-01')
    expect(s.seen[0]!.url.searchParams.get('limit')).toBe('500')
    expect(s.seen[0]!.headers['X-Key']).toBe('secret')
  })

  it('keeps only the items whose fields equal the payload keep, in any case', async () => {
    const s = service(() => ({
      body: {
        items: [{ id: '1', outlet_id: 'ABC' }, { id: '2', outlet_id: 'other' }, { id: '3' }, null],
        total: 4,
      },
    }))
    const c = feedConnector({
      url: 'https://f.example.com',
      header: 'X-Key',
      key: 'k',
      fetchImpl: s.fetchImpl,
    })
    const out = await send(c, { path: '/x', keep: { outlet_id: 'abc' } })
    expect(out).toEqual({ items: [{ id: '1', outlet_id: 'ABC' }] })
  })

  it('stops on an empty page, so a total the pages never reach does not read forever', async () => {
    const s = service(() => ({ body: { items: [], total: 99 } }))
    const c = feedConnector({
      url: 'https://f.example.com',
      header: 'X-Key',
      key: 'k',
      fetchImpl: s.fetchImpl,
    })
    expect(await send(c, { path: '/x' })).toEqual({ items: [] })
    expect(s.seen).toHaveLength(1)
  })

  it('fails on a refusal, a wrong shape or a body that is not JSON, never answering an empty list', async () => {
    const cases: [{ status?: number; body: unknown }, RegExp][] = [
      [{ status: 403, body: {} }, /refused the key/],
      [{ status: 429, body: {} }, /too many/],
      [{ status: 500, body: {} }, /500/],
      [{ body: { rows: [] } }, /unexpected shape/],
      [{ body: '<html>' }, /unexpected shape/],
    ]
    for (const [answer, error] of cases) {
      const s = service(() => answer)
      const c = feedConnector({
        url: 'https://f.example.com',
        header: 'X-Key',
        key: 'k',
        fetchImpl: s.fetchImpl,
      })
      await expect(send(c, { path: '/x' })).rejects.toThrow(error)
    }
  })

  it('never sends its key to another host: the path stays on the configured service', async () => {
    const s = service(() => ({ body: { items: [], total: 0 } }))
    const c = feedConnector({
      url: 'https://f.example.com',
      header: 'X-Key',
      key: 'k',
      fetchImpl: s.fetchImpl,
    })
    for (const path of [
      '//evil.example.com/x',
      'https://evil.example.com',
      '/a/../../x',
      'x',
      '/a?b=c',
    ]) {
      await expect(send(c, { path })).rejects.toThrow(/path/)
    }
    await expect(send(c, null)).rejects.toThrow(/path/)
    expect(s.seen).toHaveLength(0)
  })

  it('follows no redirect, which would carry the key to another host, and gives each page a time limit', async () => {
    const s = service(() => ({ body: { items: [], total: 0 } }))
    const c = feedConnector({
      url: 'https://f.example.com',
      header: 'X-Key',
      key: 'k',
      fetchImpl: s.fetchImpl,
    })
    await send(c, { path: '/x' })
    expect(s.seen[0]!.init?.redirect).toBe('error')
    expect(s.seen[0]!.init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('fails when the service redirects, and the other host never sees the key', async () => {
    const http = await import('node:http')
    const keys: (string | undefined)[] = []
    const other = http.createServer((req, res) => {
      keys.push(req.headers['x-key'] as string | undefined)
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"items":[],"total":0}')
    })
    await new Promise<void>((r) => other.listen(0, '127.0.0.1', r))
    const otherPort = (other.address() as { port: number }).port
    const server = http.createServer((req, res) => {
      res.writeHead(302, { location: `http://localhost:${otherPort}/steal` }).end()
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    try {
      const c = feedConnector({ url: `http://127.0.0.1:${port}`, header: 'X-Key', key: 'k' })
      await expect(send(c, { path: '/x' })).rejects.toThrow()
      expect(keys).toEqual([])
    } finally {
      server.close()
      other.close()
    }
  })
})
