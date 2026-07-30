import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createPerplexityResearchProvider, extractSources, toJobState } from './perplexity'
import { ResearchProviderError } from './port'
import { buildResearchPrompt } from './prompt'

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

const REQ = {
  jobId: 'job-1',
  brandName: 'Casa Vostra',
  websiteUrl: 'https://casavostra.example',
  model: 'sonar-deep-research',
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
