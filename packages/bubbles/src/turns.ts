import { randomUUID } from 'node:crypto'
import { type Gateway, type Pass } from './gateway'
import { type Said, turnText } from './prompt'
import { type Runtime, type RuntimeEvent, type RuntimeOptions } from './runtime'

/**
 * Conversations: one runtime each, kept while it is used, as openworld's `RuntimeRegistry`. A
 * turn has a deadline and may be stopped; either kills the runtime, which has no cancel, and the
 * next turn starts a fresh one with the chat replayed.
 */

/** What the page reads: the contract in `docs/executing/bubbles-plan.md`. */
export type TurnEvent =
  | { event: 'status'; data: { phase: 'starting' | 'thinking' } }
  | { event: 'tool_call'; data: { id: string; tool: string; input: unknown } }
  | {
      event: 'tool_result'
      data: {
        id: string
        tool: string
        ok: boolean
        preview?: string
        refusal?: { code: string; message: string }
      }
    }
  | { event: 'approval'; data: { id: string; tool: string; input: unknown; payload: unknown } }
  | { event: 'text'; data: { text: string } }
  | { event: 'error'; data: { code: string; message: string } }
  | { event: 'done'; data: Record<string, never> }

/** A refusal before the stream starts, as an HTTP answer. */
export class TurnRefused extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** One question, as the page sends it. */
export interface Turn {
  conversation: string
  question: string
  history: Said[]
  /** What the person is looking at, as the page names it (a kind and an id). */
  on?: string
  agent: AgentSession
}

export interface AgentSession {
  principal: string
  token: string
  expiresAt: string
}

export interface TurnsOptions {
  gateway: Gateway
  /** Starts a runtime: the real binary, or a fake in tests. */
  start: (opts: Pick<RuntimeOptions, 'env'>) => Promise<Runtime>
  model: string
  /** The MCP server name: tools arrive as `mcp__<server>__<move>`. */
  server: string
  now?: () => Date
  maxLive?: number
  idleMs?: number
  turnMs?: number
  /** A runtime whose core token expires sooner than this is replaced before a turn. */
  tokenMarginMs?: number
}

interface Live {
  principal: string
  runtime: Runtime
  pass: Pass
  session: string
  expiresAt: number
  lastUsed: number
}

/** A conversation's turn in progress, held from the request until the turn is done. */
interface Claim {
  principal: string
  stopped: boolean
}

export class Turns {
  private live = new Map<string, Live>()
  private claims = new Map<string, Claim>()
  private opening = 0
  private reaper: NodeJS.Timeout

  constructor(private opts: TurnsOptions) {
    this.reaper = setInterval(() => this.reap(), 60_000)
    this.reaper.unref()
  }

  private now() {
    return (this.opts.now ?? (() => new Date()))()
  }

  /**
   * Holds a conversation for one turn, at once and before anything waits, so two requests never
   * both start one; throws `TurnRefused` for the HTTP answer. `run` lets it go.
   */
  claim(conversation: string, agent: AgentSession): Claim {
    const held = this.claims.get(conversation)
    const owner = held?.principal ?? this.live.get(conversation)?.principal
    if (owner && owner !== agent.principal) {
      throw new TurnRefused(403, 'NOT_YOURS', 'this conversation is someone else’s')
    }
    if (held) throw new TurnRefused(409, 'BUSY', 'Bubbles is still on the last question')
    const claim = { principal: agent.principal, stopped: false }
    this.claims.set(conversation, claim)
    return claim
  }

  /** Runs one turn, passing the page's events to `emit`; never throws. */
  async run(req: Turn, emit: (e: TurnEvent) => void): Promise<void> {
    const claim = this.claims.get(req.conversation) ?? this.claim(req.conversation, req.agent)
    try {
      await this.turn(req, claim, emit)
    } finally {
      if (this.claims.get(req.conversation) === claim) this.claims.delete(req.conversation)
      emit({ event: 'done', data: {} })
    }
  }

  private async turn(req: Turn, claim: Claim, emit: (e: TurnEvent) => void) {
    let c = this.live.get(req.conversation)
    // A runtime that died on its own is replaced, never prompted again.
    if (c && !c.runtime.alive) {
      this.end(req.conversation)
      c = undefined
    }
    const expiresAt = Date.parse(req.agent.expiresAt)
    if (c && c.expiresAt - this.now().getTime() < (this.opts.tokenMarginMs ?? 10 * 60_000)) {
      this.end(req.conversation)
      c = undefined
    }
    const fresh = !c
    if (!c) {
      emit({ event: 'status', data: { phase: 'starting' } })
      try {
        c = await this.open(req.conversation, req.agent, expiresAt)
      } catch (err) {
        console.error('bubbles: runtime start failed', err)
        emit({
          event: 'error',
          data: { code: 'NOT_STARTED', message: 'Bubbles could not start. Try again in a moment.' },
        })
        return
      }
    }
    const live = c
    // Stopped while the runtime started: it ends here, and nothing more is said.
    if (claim.stopped) return this.end(req.conversation)
    live.lastUsed = Date.now()
    live.pass.reset()
    let timedOut = false
    const deadline = setTimeout(() => {
      timedOut = true
      this.end(req.conversation)
    }, this.opts.turnMs ?? 90_000)
    emit({ event: 'status', data: { phase: 'thinking' } })
    const calls = new Map<string, { tool: string; input: unknown }>()
    let failed: string | null = null
    try {
      await live.runtime.prompt(
        live.session,
        turnText(req.question, this.now(), fresh ? req.history : [], req.on),
        (e) => {
          const out = this.translate(e, calls)
          for (const o of out) emit(o)
          if (e.type === 'turn/end') {
            const kind = (e.data.reason as { kind?: string } | undefined)?.kind
            if (kind !== 'completed') failed = kind ?? 'unknown'
          }
        },
      )
      if (failed) {
        console.error('bubbles: turn ended', failed, live.runtime.tail())
        const steps = live.pass.requests >= this.opts.gateway.maxRequests
        emit({
          event: 'error',
          data: steps
            ? {
                code: 'TOO_MANY_STEPS',
                message: 'That took Bubbles too many steps. Try a narrower question.',
              }
            : { code: 'TURN_FAILED', message: 'Bubbles could not finish that. Try again.' },
        })
      }
    } catch (err) {
      if (!live.runtime.alive) this.end(req.conversation)
      if (!claim.stopped) {
        console.error('bubbles: turn failed', err)
        emit({
          event: 'error',
          data: timedOut
            ? {
                code: 'TIMEOUT',
                message: 'That took too long. Try again, or ask something smaller.',
              }
            : { code: 'TURN_FAILED', message: 'Bubbles stopped unexpectedly. Try again.' },
        })
      }
    } finally {
      clearTimeout(deadline)
      live.lastUsed = Date.now()
    }
  }

  /**
   * Ends a running turn, even one whose runtime is still starting; true when there was one. With
   * `only`, it ends that turn and never a later one on the same conversation.
   */
  stop(conversation: string, principal: string, only?: Claim): boolean {
    const claim = this.claims.get(conversation)
    if (!claim || claim.principal !== principal || (only && claim !== only)) return false
    claim.stopped = true
    this.end(conversation)
    return true
  }

  async close() {
    clearInterval(this.reaper)
    for (const id of [...this.live.keys()]) this.end(id)
  }

  private async open(conversation: string, agent: AgentSession, expiresAt: number) {
    // Runtimes still starting count, so concurrent starts cannot pass the limit.
    if (this.live.size + this.opening >= (this.opts.maxLive ?? 4)) {
      const idle = [...this.live.entries()]
        .filter(([id]) => !this.claims.has(id))
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
      if (!idle) throw new Error('every runtime is busy')
      this.end(idle[0])
    }
    const pass = this.opts.gateway.pass()
    this.opening += 1
    try {
      const runtime = await this.opts.start({
        env: {
          BUBBLES_GATEWAY_URL: this.opts.gateway.url,
          BUBBLES_GATEWAY_TOKEN: pass.token,
          BUBBLES_MODEL: this.opts.model,
          BUBBLES_CORE_TOKEN: agent.token,
        },
      })
      const live: Live = {
        principal: agent.principal,
        runtime,
        pass,
        session: `session-${randomUUID()}`,
        expiresAt,
        lastUsed: Date.now(),
      }
      this.live.set(conversation, live)
      return live
    } catch (err) {
      pass.revoke()
      throw err
    } finally {
      this.opening -= 1
    }
  }

  private end(conversation: string) {
    const c = this.live.get(conversation)
    if (!c) return
    this.live.delete(conversation)
    c.pass.revoke()
    c.runtime.kill()
  }

  private reap() {
    const cutoff = Date.now() - (this.opts.idleMs ?? 15 * 60_000)
    for (const [id, c] of this.live) if (!this.claims.has(id) && c.lastUsed < cutoff) this.end(id)
  }

  /** A runtime event as the page's events. */
  private translate(e: RuntimeEvent, calls: Map<string, { tool: string; input: unknown }>) {
    const out: TurnEvent[] = []
    if (e.type === 'tool/call') {
      const id = String(e.data.callId)
      const tool = this.moveOf(String(e.data.name))
      let input: unknown = {}
      try {
        input = JSON.parse(String(e.data.arguments || '{}'))
      } catch {
        input = {}
      }
      calls.set(id, { tool, input })
      out.push({ event: 'tool_call', data: { id, tool, input } })
    } else if (e.type === 'tool/result') {
      const message = e.data.message as { content?: unknown[] } | undefined
      for (const block of (message?.content ?? []) as Record<string, unknown>[]) {
        if (block.type !== 'tool-result') continue
        const id = String(block.toolCallId)
        const call = calls.get(id) ?? { tool: '?', input: {} }
        const text = ((block.content ?? []) as { type?: string; text?: string }[])
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('')
        if (block.isError) {
          // The core's refusal, as the MCP client words it: `Error: {code, message, details}`.
          let refusal: { code?: string; message?: string; details?: { payload?: unknown } } = {}
          try {
            refusal = JSON.parse(text.replace(/^Error:\s*/, '')) as typeof refusal
          } catch {
            refusal = {}
          }
          const code = refusal.code ?? 'TOOL_FAILED'
          out.push({
            event: 'tool_result',
            data: {
              id,
              tool: call.tool,
              ok: false,
              refusal: { code, message: refusal.message ?? 'the move failed' },
            },
          })
          if (code === 'NEEDS_APPROVAL') {
            out.push({
              event: 'approval',
              data: { id, tool: call.tool, input: call.input, payload: refusal.details?.payload },
            })
          }
        } else {
          out.push({
            event: 'tool_result',
            data: { id, tool: call.tool, ok: true, preview: text.slice(0, 300) },
          })
        }
      }
    } else if (e.type === 'assistant/message') {
      const message = e.data.message as { content?: { type?: string; text?: string }[] } | undefined
      for (const block of message?.content ?? []) {
        const text = block.type === 'text' ? (block.text ?? '').trim() : ''
        if (text) out.push({ event: 'text', data: { text } })
      }
    }
    return out
  }

  /** `mcp__<server>__post__list` is the move `post.list`. */
  private moveOf(name: string) {
    const prefix = `mcp__${this.opts.server}__`
    return (name.startsWith(prefix) ? name.slice(prefix.length) : name).replaceAll('__', '.')
  }
}
