import { describe, expect, it } from 'vitest'
import { createOpenRouterGrounded } from './grounded'
import { createLLMProvider } from './factory'
import { GroundedNotSupportedError, GroundedRequestError, ProviderNotConfiguredError } from './port'

// The wire shape these tests assert against is not invented: it is what the
// Phase E spike captured over 78 live calls. The captures are in
// `packages/agent/src/influencer/fixtures/`.

const REQ = {
  settings: { providerId: 'openrouter' as const, modelId: 'anthropic/claude-sonnet-4.6:online' },
  system: 'the rules',
  query: 'Instagram @lennardy followers',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** One captured shape, trimmed to the fields the adapter reads. */
function completion(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    choices: [
      {
        message: {
          content: '{"outcome":"ok"}',
          annotations: [
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://www.instagram.com/lennardy/',
                title: 'Lennard Yeong (@lennardy) • Instagram',
              },
            },
          ],
        },
      },
    ],
    usage: { cost: 0.0175 },
    ...over,
  }
}

describe('createOpenRouterGrounded', () => {
  it('sends the two messages, the model and the schema', async () => {
    let seen: Record<string, unknown> | undefined
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      {
        fetch: (_url, init) => {
          seen = JSON.parse(String(init?.body)) as Record<string, unknown>
          return Promise.resolve(jsonResponse(completion()))
        },
      },
    )

    await grounded({ ...REQ, jsonSchema: { type: 'object' } })

    expect(seen?.['model']).toBe('anthropic/claude-sonnet-4.6:online')
    expect(seen?.['messages']).toEqual([
      { role: 'system', content: 'the rules' },
      { role: 'user', content: 'Instagram @lennardy followers' },
    ])
    expect(seen?.['response_format']).toMatchObject({ type: 'json_schema' })
  })

  it('sends no `plugins` field — the suffix is the mechanism', async () => {
    // Both were tested against the live endpoint. `plugins: [{id:'web'}]` runs
    // the search, is billed for it, and returns **no annotations** — which would
    // leave every figure unverifiable. The `:online` suffix returns them.
    let seen: Record<string, unknown> | undefined
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      {
        fetch: (_url, init) => {
          seen = JSON.parse(String(init?.body)) as Record<string, unknown>
          return Promise.resolve(jsonResponse(completion()))
        },
      },
    )
    await grounded(REQ)
    expect(seen).not.toHaveProperty('plugins')
  })

  it('omits response_format when no schema is given', async () => {
    let seen: Record<string, unknown> | undefined
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      {
        fetch: (_url, init) => {
          seen = JSON.parse(String(init?.body)) as Record<string, unknown>
          return Promise.resolve(jsonResponse(completion()))
        },
      },
    )
    await grounded(REQ)
    expect(seen).not.toHaveProperty('response_format')
  })

  it('returns the text, the retrieval log and the cost', async () => {
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      { fetch: () => Promise.resolve(jsonResponse(completion())) },
    )
    const result = await grounded(REQ)

    expect(result.text).toBe('{"outcome":"ok"}')
    expect(result.retrieved).toEqual([
      {
        title: 'Lennard Yeong (@lennardy) • Instagram',
        url: 'https://www.instagram.com/lennardy/',
      },
    ])
    expect(result.costUsd).toBe(0.0175)
  })

  it('deduplicates the retrieval log by URL', async () => {
    // One page cited once per claim arrives three times; a caller counting
    // evidence would read that as three corroborating sources.
    const annotations = [1, 2, 3].map(() => ({
      type: 'url_citation',
      url_citation: { url: 'https://example.com/a', title: 'A' },
    }))
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      {
        fetch: () =>
          Promise.resolve(jsonResponse(completion({ choices: [{ message: { annotations } }] }))),
      },
    )
    const result = await grounded(REQ)
    expect(result.retrieved).toEqual([{ title: 'A', url: 'https://example.com/a' }])
  })

  it('drops a retrieval entry with no URL rather than keeping a blank one', async () => {
    const annotations = [
      { type: 'url_citation', url_citation: { title: 'no url here' } },
      { type: 'url_citation', url_citation: { url: 'https://example.com/b' } },
    ]
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      {
        fetch: () =>
          Promise.resolve(jsonResponse(completion({ choices: [{ message: { annotations } }] }))),
      },
    )
    const result = await grounded(REQ)
    // Falls back to the URL as the title, which is honest and renders.
    expect(result.retrieved).toEqual([
      { title: 'https://example.com/b', url: 'https://example.com/b' },
    ])
  })

  it('clamps a long page title rather than losing the whole log', async () => {
    const annotations = [
      { type: 'url_citation', url_citation: { url: 'https://e.com/a', title: 'x'.repeat(900) } },
    ]
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      {
        fetch: () =>
          Promise.resolve(jsonResponse(completion({ choices: [{ message: { annotations } }] }))),
      },
    )
    const result = await grounded(REQ)
    expect(result.retrieved[0]?.title).toHaveLength(500)
  })

  it('reports an empty retrieval log when the provider sent none', async () => {
    // One spike candidate did this on every call. `retrieved: []` means "no
    // evidence" and a caller must not read it as "searched and found nothing".
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      {
        fetch: () =>
          Promise.resolve(jsonResponse(completion({ choices: [{ message: { content: '{}' } }] }))),
      },
    )
    const result = await grounded(REQ)
    expect(result.retrieved).toEqual([])
  })

  it('reports an unknown cost as null, never as zero', async () => {
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      { fetch: () => Promise.resolve(jsonResponse(completion({ usage: {} }))) },
    )
    expect((await grounded(REQ)).costUsd).toBeNull()
  })

  it('throws on an error carried in a 200 body', async () => {
    // OpenRouter reports provider-level refusals this way, so a check on
    // `res.ok` alone lets one through as an empty completion.
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      {
        fetch: () =>
          Promise.resolve(jsonResponse({ error: { message: 'no credit', code: 402 } }, 200)),
      },
    )
    await expect(grounded(REQ)).rejects.toThrow(GroundedRequestError)
    await expect(grounded(REQ)).rejects.toThrow('no credit')
  })

  it('carries the HTTP status on a failure', async () => {
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      { fetch: () => Promise.resolve(jsonResponse({}, 429)) },
    )
    await expect(grounded(REQ)).rejects.toMatchObject({ status: 429 })
  })

  it('throws a named error for a non-JSON body', async () => {
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      { fetch: () => Promise.resolve(new Response('<html>gateway</html>', { status: 502 })) },
    )
    await expect(grounded(REQ)).rejects.toMatchObject({ status: 502 })
  })

  it('lets an abort through as an abort, not as a vendor failure', async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    const grounded = createOpenRouterGrounded({ apiKey: 'k' }, { fetch: () => Promise.reject(err) })
    await expect(grounded(REQ)).rejects.toThrow('aborted')
    await expect(grounded(REQ)).rejects.not.toBeInstanceOf(GroundedRequestError)
  })

  it('lets a timeout through as a timeout — the only abort this path ever sees', async () => {
    // **`AbortSignal.timeout()` rejects with a `TimeoutError`, not an
    // `AbortError`**, and that is the only signal `createCreatorLookup` hands
    // this function. Testing the `AbortError` alone left the real case falling
    // into the vendor-failure branch below.
    const signal = AbortSignal.timeout(1)
    const err = await new Promise<unknown>((resolve) => {
      signal.addEventListener('abort', () => resolve(signal.reason))
    })
    expect((err as Error).name).toBe('TimeoutError')

    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      { fetch: () => Promise.reject(err as Error) },
    )
    await expect(grounded(REQ)).rejects.not.toBeInstanceOf(GroundedRequestError)
  })

  it('drops a retrieved page whose URL is not http(s)', async () => {
    // The retrieval log is rendered into `href`s in the review step, and this is
    // the one place a URL enters this repository typed as `ResearchSource`
    // without ever being parsed as one.
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      {
        fetch: () =>
          Promise.resolve(
            jsonResponse({
              choices: [
                {
                  message: {
                    content: 'ok',
                    annotations: [
                      { url_citation: { url: 'javascript:alert(1)', title: 'bad' } },
                      { url_citation: { url: 'https://example.com/good', title: 'good' } },
                    ],
                  },
                },
              ],
            }),
          ),
      },
    )
    const { retrieved } = await grounded(REQ)
    expect(retrieved).toEqual([{ title: 'good', url: 'https://example.com/good' }])
  })

  it('returns empty text when the provider sends a completion with no content', async () => {
    const grounded = createOpenRouterGrounded(
      { apiKey: 'k' },
      { fetch: () => Promise.resolve(jsonResponse({ choices: [] })) },
    )
    expect((await grounded(REQ)).text).toBe('')
  })
})

describe('LLMProvider.completeGrounded', () => {
  it('refuses by name for a provider with no grounded endpoint', async () => {
    const provider = createLLMProvider({ anthropic: { apiKey: 'k' } })
    await expect(
      provider.completeGrounded({ ...REQ, settings: { providerId: 'anthropic', modelId: 'm' } }),
    ).rejects.toThrow(GroundedNotSupportedError)
  })

  it('refuses when openrouter is selected but not configured', async () => {
    const provider = createLLMProvider({ anthropic: { apiKey: 'k' } })
    await expect(provider.completeGrounded(REQ)).rejects.toThrow(ProviderNotConfiguredError)
  })

  it('reaches the endpoint when openrouter is configured', async () => {
    let called = 0
    const provider = createLLMProvider(
      { openrouter: { apiKey: 'k' } },
      {
        grounded: {
          fetch: () => {
            called += 1
            return Promise.resolve(jsonResponse(completion()))
          },
        },
      },
    )
    const result = await provider.completeGrounded(REQ)
    expect(called).toBe(1)
    expect(result.retrieved).toHaveLength(1)
  })
})
