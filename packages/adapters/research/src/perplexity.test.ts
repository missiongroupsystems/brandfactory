import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  createPerplexityResearchProvider,
  extractSources,
  searchDomainFor,
  toJobState,
} from './perplexity'
import { ResearchProviderError } from './port'
import { buildResearchPrompt, buildSectionSearchPrompt } from './prompt'

// ---------------------------------------------------------------------------
// Against the captured run, not against a hand-written mock
// ---------------------------------------------------------------------------
//
// These two files are what the vendor actually sent on 2026-07-29, for $0.377.
// A hand-written fixture tests the parser against the shape its author already
// believed; this tests it against the shape that exists. That is the entire
// return on 3A having been a paid live spike rather than a reading exercise.

const HERE = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(HERE, '..', 'fixtures', name), 'utf8')) as Record<string, unknown>

const SUBMITTED = fixture('deep-research-submit.json')
const COMPLETED = fixture('deep-research-completed.json')
// Guideline auto-fill Phase A's spike, 2026-08-03: `sonar-pro`, one section,
// 7.1 s, $0.011 — with search pinned to the brand's domain, which is the run
// the adapter reproduces. See fixtures/README.md for the unpinned control.
const SECTION_COMPLETED = fixture('section-search-completed.json')

const REQ = {
  jobId: 'job-1',
  brandName: 'Casa Vostra',
  websiteUrl: 'https://casavostra.example',
  model: 'sonar-deep-research',
}

const SECTION_REQ = {
  brandName: 'Ebb & Flow Group',
  websiteUrl: 'https://www.ebbflowgroup.com',
  label: 'Voice & tone',
  description: 'How the brand sounds — personality, phrasing rules, do/don’t examples.',
  existingLabels: ['Target audience', 'Values & positioning'],
  model: 'sonar-pro',
}

function providerWith(handler: (url: string, init: RequestInit) => unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const body = handler(String(url), init ?? {})
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
  const provider = createPerplexityResearchProvider({ apiKey: 'pplx-test', fetch: fakeFetch })
  return { provider, calls }
}

describe('start', () => {
  it('submits the async job and returns the vendor id', async () => {
    const { provider, calls } = providerWith(() => SUBMITTED)
    const { externalId } = await provider.start(REQ)

    expect(externalId).toBe(SUBMITTED.id)
    expect(calls[0]!.url).toBe('https://api.perplexity.ai/v1/async/sonar')
    expect(calls[0]!.init.method).toBe('POST')
  })

  // The one line that stops a retried start from buying a second report.
  it('sends the job id as the idempotency key', async () => {
    const { provider, calls } = providerWith(() => SUBMITTED)
    await provider.start(REQ)

    const body = JSON.parse(String(calls[0]!.init.body)) as {
      idempotency_key: string
      request: { model: string; messages: { role: string; content: string }[] }
    }
    expect(body.idempotency_key).toBe('job-1')
    expect(body.request.model).toBe('sonar-deep-research')
    expect(body.request.messages[0]!.content).toBe(buildResearchPrompt(REQ))
  })

  it('refuses a response with no id rather than returning an unpollable job', async () => {
    const { provider } = providerWith(() => ({ status: 'CREATED' }))
    await expect(provider.start(REQ)).rejects.toBeInstanceOf(ResearchProviderError)
  })

  it('carries the HTTP status on a rejection, so a caller can tell 401 from 429', async () => {
    const { provider } = providerWith(() => ({ error: 'nope' }), 401)
    await expect(provider.start(REQ)).rejects.toMatchObject({ status: 401 })
  })
})

describe('poll', () => {
  it('reads the terminal body and returns the report, sources and usage', async () => {
    const { provider, calls } = providerWith(() => COMPLETED)
    const state = await provider.poll('abc-123')

    expect(calls[0]!.url).toBe('https://api.perplexity.ai/v1/async/sonar/abc-123')
    expect(state.status).toBe('completed')
    if (state.status !== 'completed') return
    expect(state.report.length).toBeGreaterThan(1000)
    expect(state.report).toContain('## Voice & tone')
    expect(state.sources.length).toBeGreaterThan(0)
    // 3A: the vendor reports its own cost, and decision 12's guard bills it.
    expect(state.usage.costUsd).toBeGreaterThan(0)
    expect(state.usage.searchQueries).toBeGreaterThan(0)
  })

  it('percent-encodes the id rather than pasting it into the path', async () => {
    const { provider, calls } = providerWith(() => COMPLETED)
    await provider.poll('a/../b')
    expect(calls[0]!.url).toBe('https://api.perplexity.ai/v1/async/sonar/a%2F..%2Fb')
  })

  it('turns a network error into a provider error, not a failed job', async () => {
    const fakeFetch = vi.fn(() =>
      Promise.reject(new Error('ECONNRESET')),
    ) as unknown as typeof fetch
    const provider = createPerplexityResearchProvider({ apiKey: 'k', fetch: fakeFetch })
    // Thrown, so the ticker retries. Resolving `failed` here would bury a job
    // that is still running at the vendor — and still being paid for.
    await expect(provider.poll('x')).rejects.toBeInstanceOf(ResearchProviderError)
  })
})

describe('searchSection', () => {
  it('posts one chat completion with the section prompt and the requested model', async () => {
    const { provider, calls } = providerWith(() => SECTION_COMPLETED)
    await provider.searchSection(SECTION_REQ)

    expect(calls[0]!.url).toBe('https://api.perplexity.ai/chat/completions')
    expect(calls[0]!.init.method).toBe('POST')
    const body = JSON.parse(String(calls[0]!.init.body)) as {
      model: string
      messages: { role: string; content: string }[]
    }
    expect(body.model).toBe('sonar-pro')
    expect(body.messages[0]!.content).toBe(buildSectionSearchPrompt(SECTION_REQ))
  })

  // The load-bearing parameter. A0 ran the identical prompt without it and the
  // vendor wrote a confident, cited section about a same-named other company —
  // 19 of its 20 sources were generic "brand voice examples" articles. The URL
  // in the prompt is a suggestion; this is the enforcement.
  it('pins the search to the brand domain, www stripped', async () => {
    const { provider, calls } = providerWith(() => SECTION_COMPLETED)
    await provider.searchSection(SECTION_REQ)

    const body = JSON.parse(String(calls[0]!.init.body)) as { search_domain_filter: string[] }
    expect(body.search_domain_filter).toEqual(['ebbflowgroup.com'])
  })

  it('reads content, sources and vendor-reported cost off the captured run', async () => {
    const { provider } = providerWith(() => SECTION_COMPLETED)
    const result = await provider.searchSection(SECTION_REQ)

    expect(result.content.length).toBeGreaterThan(500)
    // The pinned run's whole point: every source is the brand's own domain.
    expect(result.sources.length).toBe(11)
    expect(result.sources.every((s) => s.url.includes('ebbflowgroup.com'))).toBe(true)
    expect(result.usage.costUsd).toBeGreaterThan(0)
    expect(result.usage.costUsd).toBeLessThan(0.05)
  })

  // Decision 7's seam: "the model found too little" is the service's
  // classification, not an adapter guess — unlike a COMPLETED deep run with no
  // report, where the vendor contradicts its own status.
  it('passes an empty completion through as a result, not an error', async () => {
    const { provider } = providerWith(() => ({ choices: [{ message: { content: '' } }] }))
    const result = await provider.searchSection(SECTION_REQ)
    expect(result.content).toBe('')
    expect(result.sources).toEqual([])
    expect(result.usage.costUsd).toBeNull()
  })

  it('carries the HTTP status on a rejection, so a caller can tell 401 from 429', async () => {
    const { provider } = providerWith(() => ({ error: 'nope' }), 429)
    await expect(provider.searchSection(SECTION_REQ)).rejects.toMatchObject({ status: 429 })
  })

  it('refuses an unparseable website URL before spending anything', async () => {
    const fakeFetch = vi.fn() as unknown as typeof fetch
    const provider = createPerplexityResearchProvider({ apiKey: 'k', fetch: fakeFetch })
    await expect(
      provider.searchSection({ ...SECTION_REQ, websiteUrl: 'not a url' }),
    ).rejects.toBeInstanceOf(ResearchProviderError)
    expect(fakeFetch).not.toHaveBeenCalled()
  })
})

describe('searchDomainFor', () => {
  it('derives the bare domain from the brand website URL', () => {
    expect(searchDomainFor('https://www.ebbflowgroup.com')).toBe('ebbflowgroup.com')
    expect(searchDomainFor('https://shop.example.co.uk/about')).toBe('shop.example.co.uk')
  })
})

describe('toJobState', () => {
  it('collapses CREATED and IN_PROGRESS into running', () => {
    expect(toJobState({ status: 'CREATED' }).status).toBe('running')
    expect(toJobState({ status: 'IN_PROGRESS' }).status).toBe('running')
  })

  // A vocabulary that grows must not close a job we are still paying for.
  it('treats an unknown status as still running', () => {
    expect(toJobState({ status: 'PARTIALLY_MARVELLOUS' }).status).toBe('running')
  })

  it('reports a failure with the vendor message, and a default when there is none', () => {
    expect(toJobState({ status: 'FAILED', error_message: 'rate limited' })).toEqual({
      status: 'failed',
      error: 'rate limited',
    })
    expect(toJobState({ status: 'FAILED', error_message: '  ' }).status).toBe('failed')
  })

  // Success with nothing in it is a contradiction, and 3D would be handed an
  // empty string to shape. `NO_FINDINGS` is a short report that says so — a
  // different thing, and the caller's call.
  it('fails a COMPLETED run that carries no report', () => {
    const state = toJobState({ status: 'COMPLETED', response: { choices: [] } })
    expect(state.status).toBe('failed')
  })

  it('leaves cost null when the vendor does not report one', () => {
    const state = toJobState({
      status: 'COMPLETED',
      response: { choices: [{ message: { content: '# Report' } }] },
    })
    expect(state.status === 'completed' && state.usage.costUsd).toBeNull()
  })
})

describe('extractSources', () => {
  it('prefers the titled search results over bare citations', () => {
    const sources = extractSources({
      search_results: [{ title: 'About us', url: 'https://example.com/about' }],
      citations: ['https://example.com/about'],
    })
    expect(sources).toEqual([{ title: 'About us', url: 'https://example.com/about' }])
  })

  it('falls back to the hostname when only a bare citation exists', () => {
    expect(extractSources({ citations: ['https://www.example.com/x'] })).toEqual([
      { title: 'www.example.com', url: 'https://www.example.com/x' },
    ])
  })

  it('deduplicates by URL, so the arrival toast cannot overcount', () => {
    const sources = extractSources({
      search_results: [
        { title: 'A', url: 'https://example.com/a' },
        { title: 'A again', url: 'https://example.com/a' },
      ],
    })
    expect(sources).toHaveLength(1)
  })

  it('drops a citation that is not http(s)', () => {
    expect(
      extractSources({ citations: ['javascript:alert(1)', 'https://example.com/ok'] }),
    ).toHaveLength(1)
  })

  it('reads every citation off the captured run', () => {
    const sources = extractSources(
      (COMPLETED as { response: Parameters<typeof extractSources>[0] }).response,
    )
    expect(sources.length).toBe(19)
    expect(sources.every((s) => s.title && s.url.startsWith('https://'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Both calls are bounded
// ---------------------------------------------------------------------------
//
// **Why this is not a nicety.** `poll` is awaited inside the ticker's sweep, and
// the sweep holds a `running` flag it releases in a `finally`. A `fetch` with no
// timeout never settles, so the `finally` never runs and **every later sweep in
// the process no-ops** — one unresponsive socket silently retiring the only thing
// that finishes a job nobody is watching.
//
// This is the async Sonar line, so neither call waits for the 3-15 minutes of
// actual research: `start` submits and `poll` reads a status row. A call still
// outstanding after the timeout is a hung socket, not slow work.

describe('request timeouts', () => {
  it('passes an abort signal on the submission', async () => {
    const { provider, calls } = providerWith(() => SUBMITTED)
    await provider.start(REQ)

    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal)
  })

  it('passes an abort signal on the poll', async () => {
    const { provider, calls } = providerWith(() => COMPLETED)
    await provider.poll('abc-123')

    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal)
  })

  // The section search is the one *synchronous* call — the vendor searches and
  // writes inside it, and a user is watching a spinner — so it gets its own,
  // longer ceiling rather than sharing the async line's 30 seconds.
  it('bounds the section search too, on its own timeout', async () => {
    const { provider, calls } = providerWith(() => SECTION_COMPLETED)
    await provider.searchSection(SECTION_REQ)

    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal)

    const fakeFetch = vi.fn(() =>
      Promise.reject(new DOMException('The operation was aborted.', 'TimeoutError')),
    ) as unknown as typeof fetch
    const slow = createPerplexityResearchProvider({
      apiKey: 'k',
      fetch: fakeFetch,
      sectionTimeoutMs: 1,
    })
    await expect(slow.searchSection(SECTION_REQ)).rejects.toThrow(
      /Could not reach the research provider/,
    )
  })

  // An abort surfaces as a provider error, which is what the reconciler already
  // treats as "we do not know" — so a timed-out poll leaves the paid-for job
  // alone rather than marking it dead.
  it('reports a timed-out call as unreachable, not as a failed job', async () => {
    const fakeFetch = vi.fn(() =>
      Promise.reject(new DOMException('The operation was aborted.', 'TimeoutError')),
    ) as unknown as typeof fetch
    const provider = createPerplexityResearchProvider({
      apiKey: 'k',
      fetch: fakeFetch,
      timeoutMs: 1,
    })

    await expect(provider.poll('abc-123')).rejects.toThrow(/Could not reach the research provider/)
  })
})
