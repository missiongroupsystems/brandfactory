import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'
import { Readable } from 'node:stream'

/**
 * The runtime's only way to a model: a server on this machine between the runtime and
 * OpenRouter, as openworld's `harness/gateway.py`. The runtime never holds the OpenRouter key.
 * Each runtime gets a token of its own; the gateway refuses a request that is not streamed, has
 * no token cap or offers a tool from outside the core, adds the provider rules (no data
 * collection, reasoning off) and counts the model requests of each turn.
 */

export interface GatewayOptions {
  /** OpenRouter's API, `https://openrouter.ai/api/v1`; tests point it at a fake. */
  upstream: string
  apiKey: string
  model: string
  /** The hosts OpenRouter may route to, fastest first. */
  providers: string[]
  /** The prefix every tool name carries: `mcp__<server>__`. */
  toolPrefix: string
  /** Most model requests in one turn. */
  maxRequests?: number
  maxTokens?: number
  /** Waits before each retry of a busy upstream, within `retryBudgetMs`. */
  retryDelaysMs?: number[]
  retryBudgetMs?: number
  /** Longest wait for a model's whole answer. */
  answerMs?: number
}

/** One runtime's pass to the gateway, and its count of model requests this turn. */
export interface Pass {
  token: string
  /** Starts a new turn's count. */
  reset(): void
  readonly requests: number
  revoke(): void
}

const RETRY = new Set([429, 502, 503, 529])
const KEPT = [
  'messages',
  'tools',
  'tool_choice',
  'parallel_tool_calls',
  'temperature',
  'top_p',
  'stop',
]

export class Gateway {
  private passes = new Map<string, { requests: number }>()
  private server: Server
  url = ''
  /** Most model requests in one turn. */
  readonly maxRequests: number

  constructor(private opts: GatewayOptions) {
    this.maxRequests = opts.maxRequests ?? 12
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((err: unknown) => {
        console.error('gateway', err)
        if (!res.headersSent) refuse(res, 502, 'the model could not be reached')
        else res.end()
      })
    })
  }

  async listen(): Promise<void> {
    await new Promise<void>((ok) => this.server.listen(0, '127.0.0.1', ok))
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  close(): Promise<void> {
    return new Promise((ok) => this.server.close(() => ok()))
  }

  pass(): Pass {
    const token = randomBytes(24).toString('base64url')
    const state = { requests: 0 }
    this.passes.set(token, state)
    return {
      token,
      reset: () => (state.requests = 0),
      get requests() {
        return state.requests
      },
      revoke: () => this.passes.delete(token),
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
    const state = token ? this.passes.get(token) : undefined
    if (!state) return refuse(res, 401, 'unknown runtime')
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      return refuse(res, 404, 'only chat completions')
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse(await read(req)) as Record<string, unknown>
    } catch {
      return refuse(res, 400, 'the body is not JSON')
    }
    const cap = Number(body.max_completion_tokens ?? body.max_tokens)
    const maxTokens = this.opts.maxTokens ?? 2048
    if (body.stream !== true) return refuse(res, 400, 'requests must stream')
    if (!Number.isFinite(cap) || cap <= 0) return refuse(res, 400, 'requests need a token cap')
    const tools = (body.tools ?? []) as { function?: { name?: string } }[]
    if (!tools.every((t) => t.function?.name?.startsWith(this.opts.toolPrefix))) {
      return refuse(res, 400, 'a tool from outside the core')
    }
    if (state.requests >= this.maxRequests) {
      return refuse(res, 429, 'too many model requests in one turn')
    }
    state.requests += 1

    // Only the fields a chat needs: the runtime cannot add routing or plugin fields of its own.
    const kept = Object.fromEntries(
      KEPT.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]),
    )
    const out = JSON.stringify({
      ...kept,
      stream: true,
      model: this.opts.model,
      max_tokens: Math.min(cap, maxTokens),
      stream_options: { include_usage: true },
      reasoning: { enabled: false },
      provider: {
        only: this.opts.providers,
        allow_fallbacks: true,
        sort: 'latency',
        require_parameters: true,
        data_collection: 'deny',
      },
    })
    // A runtime that goes away (a stopped or timed-out turn) stops the model generating, and so
    // being paid for; a model that never answers is given up on.
    const abort = new AbortController()
    res.on('close', () => abort.abort())
    const upstream = await this.send(out, abort.signal)
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
    })
    if (!upstream.body) return res.end()
    const answer = Readable.fromWeb(upstream.body as never)
    answer.on('error', () => res.destroy())
    answer.pipe(res)
  }

  /** Sends one request, retrying a busy upstream before any byte reaches the runtime. */
  private async send(body: string, signal: AbortSignal): Promise<Response> {
    const delays = this.opts.retryDelaysMs ?? [1500, 3000, 6000, 9000]
    const budget = Date.now() + (this.opts.retryBudgetMs ?? 20_000)
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${this.opts.upstream}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          'content-type': 'application/json',
          'x-title': 'Bubbles',
        },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.opts.answerMs ?? 60_000)]),
      })
      const wait = delays[attempt]
      if (!RETRY.has(res.status) || wait === undefined || Date.now() + wait > budget) return res
      await res.body?.cancel()
      await new Promise((ok) => setTimeout(ok, wait))
      if (signal.aborted) return res
    }
  }
}

function refuse(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: { message } }))
}

async function read(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString()
}
