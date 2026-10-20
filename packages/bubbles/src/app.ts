import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { type Said } from './prompt'
import { type AgentSession, TurnRefused, type Turns } from './turns'

/**
 * Bubbles' HTTP door for the page: `POST /turns` streams one turn, `POST /turns/:id/stop` ends
 * it. The person's own token comes with each request; Bubbles trades it at the core for the
 * person's agent token (`POST /agents/session`), so it never acts with the person's own rights.
 */

const CONVERSATION = /^[A-Za-z0-9-]{8,64}$/
const ON = /^[\w .:-]{1,120}$/
const MAX_QUESTION = 4000
const MAX_HISTORY = 50
const MAX_ATTACH = 12
/** An attached thing goes by kind and id only, so no free words from the page reach the prompt. */
const KIND = /^[a-z][a-z ]{0,30}$/
const ID = /^[\w.:-]{1,80}$/

export interface BubblesDeps {
  turns: Turns
  /** Asks the core for the person's agent; throws `TurnRefused` when the core says no. */
  agentSession: (authorization: string) => Promise<AgentSession>
  corsOrigins?: string[]
}

function readTurn(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>
  const { conversation, question, history = [], on, attach = [] } = b
  if (typeof conversation !== 'string' || !CONVERSATION.test(conversation)) {
    throw new TurnRefused(400, 'VALIDATION', 'conversation is 8 to 64 letters, digits or -')
  }
  if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION) {
    throw new TurnRefused(400, 'VALIDATION', `question is 1 to ${MAX_QUESTION} characters`)
  }
  if (!Array.isArray(history) || history.length > MAX_HISTORY) {
    throw new TurnRefused(400, 'VALIDATION', `history is a list of at most ${MAX_HISTORY}`)
  }
  const said: Said[] = history.map((h: unknown) => {
    const s = (h ?? {}) as Record<string, unknown>
    if ((s.role !== 'user' && s.role !== 'bubbles') || typeof s.text !== 'string') {
      throw new TurnRefused(400, 'VALIDATION', 'history holds { role, text }')
    }
    return { role: s.role, text: s.text.slice(0, MAX_QUESTION) }
  })
  if (on !== undefined && (typeof on !== 'string' || !ON.test(on))) {
    throw new TurnRefused(400, 'VALIDATION', 'on is a short name, such as a kind and an id')
  }
  if (!Array.isArray(attach) || attach.length > MAX_ATTACH) {
    throw new TurnRefused(400, 'VALIDATION', `attach is a list of at most ${MAX_ATTACH}`)
  }
  const attached = attach.map((a: unknown) => {
    const x = (a ?? {}) as Record<string, unknown>
    if (
      typeof x.kind !== 'string' ||
      !KIND.test(x.kind) ||
      typeof x.id !== 'string' ||
      !ID.test(x.id)
    ) {
      throw new TurnRefused(400, 'VALIDATION', 'attach holds { kind, id }: a short kind and an id')
    }
    return { kind: x.kind, id: x.id }
  })
  return { conversation, question: question.trim(), history: said, on, attach: attached }
}

export function createBubbles(deps: BubblesDeps) {
  const app = new Hono()
  if (deps.corsOrigins?.length) {
    app.use('*', cors({ origin: deps.corsOrigins, credentials: false, maxAge: 600 }))
  }
  app.onError((err, c) => {
    if (err instanceof TurnRefused) {
      return c.json({ code: err.code, message: err.message }, err.status as 400)
    }
    console.error(err)
    return c.json({ code: 'INTERNAL', message: 'something went wrong' }, 500)
  })

  const agentOf = (authorization: string | undefined) => {
    if (!authorization) throw new TurnRefused(401, 'UNAUTHORIZED', 'missing bearer token')
    return deps.agentSession(authorization)
  }

  app.get('/health', (c) => c.json({ ok: true }))

  app.post('/turns', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new TurnRefused(400, 'VALIDATION', 'the body is not JSON')
    }
    const turn = readTurn(body)
    const agent = await agentOf(c.req.header('authorization'))
    const claim = deps.turns.claim(turn.conversation, agent)
    return streamSSE(c, async (stream) => {
      // A page that goes away stops its turn, so no runtime works for nobody; a late abort
      // never stops the person's next turn.
      stream.onAbort(() => {
        deps.turns.stop(turn.conversation, agent.principal, claim)
      })
      // A page that left before the stream opened has no abort to come.
      if (c.req.raw.signal.aborted) deps.turns.stop(turn.conversation, agent.principal, claim)
      let n = 0
      let written = Promise.resolve()
      await deps.turns.run({ ...turn, agent }, (e) => {
        written = written.then(() =>
          stream.writeSSE({ id: String(++n), event: e.event, data: JSON.stringify(e.data) }),
        )
      })
      await written
    })
  })

  app.post('/turns/:conversation/stop', async (c) => {
    const agent = await agentOf(c.req.header('authorization'))
    deps.turns.stop(c.req.param('conversation'), agent.principal)
    return c.body(null, 204)
  })

  return app
}

/** The core's `POST /agents/session`, with the person's token. */
export function coreAgentSession(coreUrl: string) {
  return async (authorization: string): Promise<AgentSession> => {
    const res = await fetch(`${coreUrl}/agents/session`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'bubbles' }),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, string>
    if (!res.ok) {
      const status = res.status === 401 || res.status === 403 ? res.status : 502
      throw new TurnRefused(status, data.code ?? 'CORE', data.message ?? 'the core refused')
    }
    return data as unknown as AgentSession
  }
}
