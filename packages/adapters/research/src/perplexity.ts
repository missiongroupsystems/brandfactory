import type { ResearchSource } from '@brandfactory/shared'
import {
  type ResearchJobState,
  type ResearchProvider,
  ResearchProviderError,
  type ResearchRequest,
  type ResearchUsage,
  type SectionSearchRequest,
  type SectionSearchResult,
} from './port'
import { buildResearchPrompt, buildSectionSearchPrompt } from './prompt'

// ---------------------------------------------------------------------------
// Perplexity, against the async Sonar line
// ---------------------------------------------------------------------------
//
// Every shape below was read off a **real captured run**, not off the docs:
// `fixtures/deep-research-{submit,completed}.json`, recorded by 3A on
// 2026-07-29 for $0.377 and four minutes. That is the whole point of having
// paid for the spike — the parser is written against what the vendor sent.
//
//   POST /v1/async/sonar        { request: {...}, idempotency_key }  → { id, status: CREATED }
//   GET  /v1/async/sonar/:id                                         → { status, response?, error_message }
//
// The vendor's status vocabulary is `CREATED | IN_PROGRESS | COMPLETED |
// FAILED`. `CREATED` collapses into `running` here: it is "accepted, not
// started", which is a distinction the job row has no use for — a caller
// deciding what to render has exactly two questions, *is it finished* and *did
// it work*.

const DEFAULT_BASE_URL = 'https://api.perplexity.ai'

/**
 * How long either call may take before it is abandoned.
 *
 * **Both calls here are short by construction** — this is the *async* Sonar
 * line, so `start` submits a job and returns an id, and `poll` reads a status
 * row. Neither waits for the 3–15 minutes of actual research; that is what the
 * job row and the ticker are for. So a call still outstanding after 30 seconds
 * is a hung socket, not slow work.
 *
 * The default matters because of where these run. `poll` is awaited inside the
 * ticker's sweep, which holds a `running` flag released in a `finally` — and a
 * `fetch` with no timeout never settles, so `finally` never runs and **every
 * later sweep in the process no-ops.** One unresponsive socket would have
 * silently retired the only thing that finishes a job nobody is watching.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

/**
 * The section search's own, longer ceiling.
 *
 * Unlike `start`/`poll`, `searchSection` is **synchronous work**: the vendor
 * searches and writes inside the one HTTP call, and a user is watching a
 * spinner on the other end. The A0 spike measured 5–7 seconds; sixty is the
 * slow-vendor-day allowance, after which a spinner has become a lie and the
 * honest move is the error toast.
 */
export const DEFAULT_SECTION_TIMEOUT_MS = 60_000

export interface PerplexityResearchConfig {
  apiKey: string
  baseUrl?: string
  /** Per-request timeout for `start`/`poll`. See `DEFAULT_REQUEST_TIMEOUT_MS`. */
  timeoutMs?: number
  /** Per-request timeout for `searchSection`. See `DEFAULT_SECTION_TIMEOUT_MS`. */
  sectionTimeoutMs?: number
  /** Test seam. Defaults to the global `fetch`. */
  fetch?: typeof fetch
}

// --- the vendor's wire shapes, named so the parser reads as a parser ---------

/**
 * The completion payload both lines share. The async line nests it under
 * `response`; the chat line (`POST /chat/completions`, used by
 * `searchSection`) **is** this shape at the top level — the A0 capture
 * (`fixtures/section-search-completed.json`) confirms the same
 * `choices`/`citations`/`search_results`/`usage` field names, which is what
 * lets `extractSources`/`extractUsage` serve both.
 */
interface VendorPayload {
  choices?: { message?: { content?: string } }[]
  citations?: string[]
  search_results?: { title?: string; url?: string }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    reasoning_tokens?: number
    citation_tokens?: number
    num_search_queries?: number
    cost?: { total_cost?: number }
  }
}

interface VendorEnvelope {
  id?: string
  status?: string
  error_message?: string | null
  response?: VendorPayload | null
}

/**
 * Citations, preferring the titled form.
 *
 * The live body carries **both** `citations` (bare URLs) and `search_results`
 * (title + url), 19 of each and in the same order. `search_results` is
 * strictly better — decision 9 puts these next to a draft, and a link whose
 * text is its own URL is a worse citation — so `citations` is the fallback for
 * a response that only has that, with the hostname standing in for a title.
 *
 * Deduplicated by URL: a report that cites one page twice must not make the
 * arrival toast say "from 20 sources" when it means 19.
 */
export function extractSources(response: VendorEnvelope['response']): ResearchSource[] {
  const seen = new Set<string>()
  const out: ResearchSource[] = []

  const push = (url: string | undefined, title: string | undefined) => {
    if (!url || seen.has(url)) return
    // The schema restricts citations to http/https for the same stored-XSS
    // reason as every other user-facing URL in this repo — except here the
    // "user" is a search vendor, which is not a reason to trust it more.
    if (!/^https?:\/\//i.test(url)) return
    seen.add(url)
    let fallback = url
    try {
      fallback = new URL(url).hostname
    } catch {
      /* keep the raw url as the title */
    }
    out.push({ title: title?.trim() || fallback, url })
  }

  for (const r of response?.search_results ?? []) push(r.url, r.title)
  for (const url of response?.citations ?? []) push(url, undefined)
  return out
}

/**
 * The domain the section search is pinned to, from the brand's website URL.
 *
 * Refuses an unparseable URL rather than searching unpinned, because unpinned
 * is the A0 failure mode: a confident, cited section about a same-named other
 * company. Upstream validation (`BrandWebsiteUrlSchema`) makes this
 * unreachable through the routes; a direct caller in a test can still find it.
 *
 * `www.` is stripped because the filter is a *site*, not a host: the vendor
 * matches subdomains under the bare domain, and the live capture pinned to
 * `ebbflowgroup.com` returned `www.` pages.
 */
export function searchDomainFor(websiteUrl: string): string {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, '')
  } catch {
    throw new ResearchProviderError(
      `Cannot derive a search domain from website URL "${websiteUrl}" — refusing to search unpinned.`,
    )
  }
}

function extractUsage(response: VendorEnvelope['response']): ResearchUsage {
  const u = response?.usage
  return {
    // Reported by the vendor. Never recomputed here — see `ResearchUsage`.
    costUsd: u?.cost?.total_cost ?? null,
    searchQueries: u?.num_search_queries ?? null,
    inputTokens: u?.prompt_tokens ?? null,
    outputTokens: u?.completion_tokens ?? null,
    reasoningTokens: u?.reasoning_tokens ?? null,
    citationTokens: u?.citation_tokens ?? null,
  }
}

/** The vendor envelope → the port's three states. Exported for its own tests. */
export function toJobState(body: VendorEnvelope): ResearchJobState {
  const status = body.status
  if (status === 'COMPLETED') {
    const report = body.response?.choices?.[0]?.message?.content ?? ''
    // A completed run with no report is a vendor contradiction, and passing it
    // on as a success would hand 3D an empty string to shape. It is reported as
    // a failure here; `NO_FINDINGS` is a *short report that says so*, which is
    // a different thing and stays the caller's call.
    if (!report.trim()) {
      return { status: 'failed', error: 'The provider reported success but returned no report.' }
    }
    return {
      status: 'completed',
      report,
      sources: extractSources(body.response),
      usage: extractUsage(body.response),
    }
  }
  if (status === 'FAILED') {
    return {
      status: 'failed',
      error: body.error_message?.trim() || 'The research provider failed.',
    }
  }
  // CREATED and IN_PROGRESS both mean "come back later". An unknown status does
  // too: inventing a terminal state for a vocabulary that has grown would close
  // a job the vendor is still working on, and the ticker's next sweep costs
  // nothing.
  return { status: 'running' }
}

export function createPerplexityResearchProvider(
  config: PerplexityResearchConfig,
): ResearchProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  const doFetch = config.fetch ?? fetch
  const timeoutMs = config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const sectionTimeoutMs = config.sectionTimeoutMs ?? DEFAULT_SECTION_TIMEOUT_MS

  async function call<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    callTimeoutMs: number,
  ): Promise<T> {
    let res: Response
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        // A bounded call, so the sweep that awaits it always returns. See
        // `DEFAULT_REQUEST_TIMEOUT_MS` for why that is the load-bearing part.
        signal: AbortSignal.timeout(callTimeoutMs),
      })
    } catch (cause) {
      // A network error is not a job failure — the job may well be running at
      // the vendor. It is thrown so the ticker retries rather than marking a
      // paid-for run dead. A timeout lands here too and says the same thing:
      // we do not know, so change nothing.
      throw new ResearchProviderError(
        `Could not reach the research provider: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ResearchProviderError(
        `Research provider returned ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`,
        res.status,
      )
    }
    return (await res.json()) as T
  }

  return {
    async start(req: ResearchRequest) {
      const body = await call<VendorEnvelope>(
        'POST',
        '/v1/async/sonar',
        {
          request: {
            model: req.model,
            messages: [{ role: 'user', content: buildResearchPrompt(req) }],
          },
          // **The job id, deliberately.** A `start` retried after a timeout is
          // the ordinary failure mode of a two-minute HTTP call, and without this
          // it buys a second $0.38 report for one row.
          idempotency_key: req.jobId,
        },
        timeoutMs,
      )
      if (!body.id) {
        throw new ResearchProviderError('Research provider accepted the job but returned no id.')
      }
      return { externalId: body.id }
    },

    async poll(externalId: string) {
      return toJobState(
        await call<VendorEnvelope>(
          'GET',
          `/v1/async/sonar/${encodeURIComponent(externalId)}`,
          undefined,
          timeoutMs,
        ),
      )
    },

    async searchSection(req: SectionSearchRequest): Promise<SectionSearchResult> {
      const body = await call<VendorPayload>(
        'POST',
        '/chat/completions',
        {
          model: req.model,
          messages: [{ role: 'user', content: buildSectionSearchPrompt(req) }],
          // **The load-bearing parameter, and A0 is why.** The same prompt ran
          // twice on the same day: unpinned, the vendor retrieved 19 generic
          // "brand voice examples" articles and wrote a confident, cited
          // section about a same-named other company; pinned to the brand's
          // domain, all 11 sources were the brand's own pages and the text
          // quoted the site's own words. The URL in the prompt is a
          // suggestion; this is the enforcement.
          search_domain_filter: [searchDomainFor(req.websiteUrl)],
        },
        sectionTimeoutMs,
      )
      // An empty completion passes through: classifying "the model found too
      // little" is the service's call (decision 7), not an adapter guess —
      // unlike `toJobState`, where an empty *report* contradicts a COMPLETED
      // status the vendor itself asserted.
      return {
        content: body.choices?.[0]?.message?.content ?? '',
        sources: extractSources(body),
        usage: extractUsage(body),
      }
    },
  }
}
