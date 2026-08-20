import { ResearchSourceSchema, type ResearchSource } from '@brandfactory/shared'
import { type GroundedRequest, type GroundedResult, GroundedRequestError } from './port'

// ---------------------------------------------------------------------------
// Grounded completion, over OpenRouter's chat-completions endpoint
// ---------------------------------------------------------------------------
//
// **The one place in this repository that calls a model over raw HTTP**, and it
// is here rather than in a caller because that is where the vendor's name is
// allowed to be. `factory.ts` already imports `@openrouter/ai-sdk-provider`;
// this file is the same boundary reached one level lower, because the AI SDK
// does not expose the two things a lookup needs — the web plugin and the
// retrieval log it produces.
//
// `port.ts`' `GroundedRequest` docstring holds the measurements. In short:
// `generateObject` never engages the plugin and fails silently, and the
// annotations array that proves what was read is discarded by the SDK even when
// it does.
//
// **The `:online` suffix belongs to the model id in config, not to this file.**
// OpenRouter offers the plugin two ways — `model: "…:online"` and a `plugins`
// array — and they are not equivalent in what they return. Sending
// `plugins: [{id: 'web'}]` was tested: the search runs and is billed, and the
// response carries **no `annotations`**, which would leave every figure
// unverifiable. The suffix was what the spike measured and it is what is used,
// so `INFLUENCER_LOOKUP_MODEL` carries it and this file adds nothing. That also
// keeps the rule `packages/server/src/adapters.ts` holds: the vendor mechanism
// is named in `.env`, not in code.

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/** What OpenRouter returns. Only the parts this file reads. */
interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string | null
      /** The retrieval log. Present when the `:online` suffix ran the web plugin. */
      annotations?: {
        type?: string
        url_citation?: { url?: string; title?: string }
      }[]
    }
  }[]
  usage?: { cost?: number }
  error?: { message?: string; code?: number }
}

export interface GroundedDeps {
  /** Test seam. Defaults to global `fetch`. */
  fetch?: typeof globalThis.fetch
  baseURL?: string
}

export function createOpenRouterGrounded(
  config: { apiKey: string; baseURL?: string },
  deps: GroundedDeps = {},
): (req: GroundedRequest) => Promise<GroundedResult> {
  const doFetch = deps.fetch ?? globalThis.fetch
  const baseURL = deps.baseURL ?? config.baseURL ?? OPENROUTER_BASE_URL

  return async function completeGrounded(req: GroundedRequest): Promise<GroundedResult> {
    const body: Record<string, unknown> = {
      model: req.settings.modelId,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.query },
      ],
      max_tokens: req.maxTokens ?? 1500,
    }

    if (req.jsonSchema) {
      body['response_format'] = {
        type: 'json_schema',
        json_schema: { name: 'grounded_result', strict: true, schema: req.jsonSchema },
      }
    }

    let res: Response
    try {
      res = await doFetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: req.signal,
      })
    } catch (err) {
      // An abort is the caller's own doing and must not be dressed up as a
      // vendor failure.
      //
      // **Both names, and `TimeoutError` is the one that actually happens.**
      // `AbortController.abort()` rejects with an `AbortError`; the only signal
      // this path is ever handed is `AbortSignal.timeout()` from
      // `server/src/influencer/lookup.ts`, and that rejects with a
      // `TimeoutError`. Testing for the first alone meant this branch never ran
      // in production and the case the comment describes was the one case not
      // covered.
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        throw err
      }
      throw new GroundedRequestError(err instanceof Error ? err.message : String(err), null)
    }

    let json: ChatCompletionResponse
    try {
      json = (await res.json()) as ChatCompletionResponse
    } catch {
      // A non-JSON body on a non-OK status is a gateway page, and the status is
      // the only useful thing in it.
      throw new GroundedRequestError(
        `provider returned a non-JSON body (HTTP ${res.status})`,
        res.status,
      )
    }

    // **The status is checked after the body is read, not before.** OpenRouter
    // reports provider-level refusals as a 200 carrying `error`, so a check on
    // `res.ok` alone would let one through as an empty completion.
    if (json.error) {
      throw new GroundedRequestError(
        json.error.message ?? 'unknown provider error',
        json.error.code ?? (res.ok ? null : res.status),
      )
    }
    if (!res.ok) {
      throw new GroundedRequestError(`provider returned HTTP ${res.status}`, res.status)
    }

    const message = json.choices?.[0]?.message

    return {
      text: message?.content ?? '',
      retrieved: readRetrieved(message?.annotations),
      // `?? null` and never `?? 0`: a missing cost is unknown, and a spend guard
      // that reads unknown as free is not a guard. `ResearchUsage.costUsd` makes
      // the same call for the same reason.
      costUsd: json.usage?.cost ?? null,
    }
  }
}

/**
 * The retrieval log, narrowed to `{title, url}` and deduplicated by URL.
 *
 * **Deduplicated because the same page is cited once per claim**, so a model
 * that read one profile and made three statements about it produces three
 * identical entries — and a caller counting evidence would read that as three
 * corroborating sources.
 *
 * Order is the provider's, which is retrieval order. Nothing re-ranks it: a
 * caller checking whether a handle was read anywhere does not care about order,
 * and a caller showing sources to a person should show them as they were found.
 *
 * **Every entry is parsed against `ResearchSourceSchema` rather than trusted to
 * match it.** This is the one place in the repository where a URL arrives from
 * outside and is typed as `ResearchSource` without ever being validated — the
 * type said `http(s)`, capped at 2048, and the provider's JSON said whatever it
 * said. That value is rendered into an `href` downstream, and the `http`/`https`
 * filter is the whole reason `WebsiteUrlSchema` exists: zod accepts
 * `javascript:alert(1)` as a valid URL. A failing entry is dropped, never
 * repaired, and never takes the good entries with it.
 */
function readRetrieved(
  annotations: { type?: string; url_citation?: { url?: string; title?: string } }[] | undefined,
): ResearchSource[] {
  if (!annotations) return []
  const seen = new Set<string>()
  const out: ResearchSource[] = []
  for (const entry of annotations) {
    const url = entry.url_citation?.url
    if (!url || seen.has(url)) continue
    seen.add(url)
    // The title is capped at 500 by `ResearchSourceSchema` and a retrieved page
    // title can run longer, so it is clamped here rather than rejected there —
    // losing the whole retrieval log over a long `<title>` would turn a
    // cosmetic problem into an unverifiable answer.
    const parsed = ResearchSourceSchema.safeParse({
      title: (entry.url_citation?.title ?? url).slice(0, 500),
      url,
    })
    if (parsed.success) out.push(parsed.data)
  }
  return out
}
