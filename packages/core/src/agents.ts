import { createHmac, timingSafeEqual } from 'node:crypto'
import { type AuthProvider } from './auth'
import { Refused } from './errors'
import { addPrincipal } from './registry'
import { authenticate, type CoreDeps } from './run'

/**
 * Agent sessions. A service that runs an agent for a person (a chat, say) asks here, with the
 * person's own token, for a short-lived token of that person's named agent. The agent is a
 * principal of its own (`<person>/<name>`, `agent_of` the person), so every call it makes is
 * checked against its loadout and its person's, cannot approve or promote, and is logged as the
 * agent's.
 */

/** How long an agent's token lasts. */
export const AGENT_TOKEN_MS = 60 * 60 * 1000

const PREFIX = 'agent.'
const NAME = /^[a-z][a-z0-9-]{0,31}$/

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export interface AgentTokens {
  sign(principal: string, now: Date): { token: string; expiresAt: string }
  /** The principal a token names, or null for anything this core did not sign or that expired. */
  verify(token: string, now: Date): string | null
}

/** Tokens signed with the core's agent secret: `agent.<payload>.<mac>`. */
export function agentTokens(secret: string): AgentTokens {
  const mac = (payload: string) =>
    createHmac('sha256', secret)
      .update(PREFIX + payload)
      .digest()
  return {
    sign(principal, now) {
      const exp = now.getTime() + AGENT_TOKEN_MS
      const payload = b64(JSON.stringify({ sub: principal, exp }))
      return {
        token: `${PREFIX}${payload}.${b64(mac(payload))}`,
        expiresAt: new Date(exp).toISOString(),
      }
    },
    verify(token, now) {
      if (!token.startsWith(PREFIX)) return null
      const [payload, given, extra] = token.slice(PREFIX.length).split('.')
      if (!payload || !given || extra !== undefined) return null
      const want = mac(payload)
      const got = Buffer.from(given, 'base64url')
      if (got.length !== want.length || !timingSafeEqual(got, want)) return null
      let claims: { sub?: unknown; exp?: unknown }
      try {
        claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as typeof claims
      } catch {
        return null
      }
      if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null
      return claims.exp > now.getTime() ? claims.sub : null
    },
  }
}

/** The sign-in, plus agent tokens: an `agent.` token is this core's, never the sign-in's. */
export function withAgentTokens(
  auth: AuthProvider,
  tokens: AgentTokens,
  now: () => Date,
): AuthProvider {
  return {
    async verifyToken(token) {
      if (!token.startsWith(PREFIX)) return auth.verifyToken(token)
      const principal = tokens.verify(token, now())
      if (!principal) throw new Error('invalid agent token')
      return { userId: principal }
    },
  }
}

/**
 * `POST /agents/session` with `{ name }`: a person's agent and a token for it. The agent is made
 * on first use, and each session copies the person's loadouts to it, so it may do what the person
 * may do today and no more; the core still checks both on every call.
 */
export async function agentSession(
  deps: CoreDeps,
  req: { authorization: string | undefined; input: unknown },
) {
  if (!deps.agents) throw new Refused(503, 'NO_AGENTS', 'this core has no agent secret')
  const person = await authenticate(deps.auth, req.authorization)
  const name = (req.input as { name?: unknown } | null)?.name
  if (typeof name !== 'string' || !NAME.test(name)) {
    throw new Refused(400, 'VALIDATION', 'name is 1 to 32 lowercase letters, digits or -')
  }
  const principal = `${person}/${name}`
  await deps.db.transaction(async (tx) => {
    const [who] = await tx.query<{ agent_of: string | null }>(
      'select agent_of from packs.principals where id = $1',
      [person],
    )
    if (!who) throw new Refused(403, 'NO_ACCOUNT', 'this account has no access')
    if (who.agent_of) throw new Refused(403, 'NOT_A_PERSON', 'only a person can start an agent')
    await addPrincipal(tx, principal, person)
    // An upsert, so two sessions starting at once both succeed; packs the person lost go too.
    await tx.query(
      `insert into packs.loadouts (principal, pack, ops)
       select $1, pack, ops from packs.loadouts where principal = $2
       on conflict (principal, pack) do update set ops = excluded.ops`,
      [principal, person],
    )
    await tx.query(
      `delete from packs.loadouts a where a.principal = $1
       and not exists (select 1 from packs.loadouts p where p.principal = $2 and p.pack = a.pack)`,
      [principal, person],
    )
  })
  return { principal, ...deps.agents.sign(principal, deps.now()) }
}
