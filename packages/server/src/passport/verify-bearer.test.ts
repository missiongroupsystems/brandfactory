import { describe, expect, it, vi } from 'vitest'
import { createBearerVerifier } from './verify-bearer'

/**
 * The shared two-issuer verifier.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6c/7.
 *
 * This exists as ONE function because phase 6A put the fallthrough in the HTTP
 * middleware only and left the websocket upgrade calling the adapter directly — a
 * silent, asymmetric failure where a hosted-login user's requests work and their socket
 * never opens. `middleware/auth.test.ts` and `ws.test.ts` both exercise it through their
 * own transport; this file pins the resolution itself.
 */

class Expired extends Error {}

function verifier(
  over: Partial<Parameters<typeof createBearerVerifier>[1]> = {},
  authFails: Error = new Error('no matching kid'),
) {
  const calls = { verify: 0, resolve: 0 }
  const auth = {
    verifyToken: async (token: string) => {
      if (token === 'app-native') return { userId: 'local-native' }
      throw authFails
    },
    getUserById: async () => null,
  }
  const verify = createBearerVerifier(auth, {
    active: () => true,
    verify: async (token) => {
      calls.verify++
      return token === 'passport' ? { sub: 'passport-sub', email: 'bob@acme.test' } : null
    },
    isExpired: (err) => err instanceof Expired,
    resolveUser: async (email) => {
      calls.resolve++
      return email === 'bob@acme.test'
        ? { ok: true, userId: 'local-from-email' }
        : { ok: false, reason: 'not_a_member' }
    },
    ...over,
  })
  return { verify, calls }
}

describe('the shared bearer verifier', () => {
  it('accepts an app-native token and names the issuer', async () => {
    const { verify, calls } = verifier()
    expect(await verify('app-native')).toEqual({ userId: 'local-native', issuer: 'app-native' })
    // The fallthrough must not run when the first issuer succeeded.
    expect(calls.verify).toBe(0)
  })

  it('falls through to Passport and resolves the local user BY EMAIL', async () => {
    const { verify } = verifier()
    // NOT `passport-sub`: that subject belongs to a foreign project, and `users.id`
    // here holds whatever project authenticated.
    expect(await verify('passport')).toEqual({
      userId: 'local-from-email',
      issuer: 'passport',
    })
  })

  // THE trap. An expired token is terminal: retrying it against Passport's issuer would
  // fail there too and only hide the real reason. The mirror of this ordering — a
  // narrower check above the broader one — 401'd every Passport-authenticated request
  // for another consumer's entire SSO rollout.
  it('treats an expired token as terminal, without trying Passport', async () => {
    const { verify, calls } = verifier({}, new Expired('jwt expired'))
    expect(await verify('anything')).toBeNull()
    expect(calls.verify).toBe(0)
  })

  it('returns null for a token neither issuer accepts', async () => {
    const { verify } = verifier()
    expect(await verify('garbage')).toBeNull()
  })

  it('returns null for a valid Passport token whose email is not a member', async () => {
    const { verify } = verifier({
      verify: async () => ({ sub: 's', email: 'stranger@example.test' }),
    })
    // A valid token proves who somebody is, not that they belong here.
    expect(await verify('passport')).toBeNull()
  })

  it('does nothing Passport-shaped when SSO is inactive', async () => {
    const { verify, calls } = verifier({ active: () => false })
    expect(await verify('passport')).toBeNull()
    expect(calls.verify).toBe(0)
  })

  it('behaves as a single-issuer verifier when no fallback is given', async () => {
    const verify = createBearerVerifier({
      verifyToken: async () => {
        throw new Error('nope')
      },
      getUserById: async () => null,
    })
    expect(await verify('x')).toBeNull()
  })

  // The property the whole module exists for: both transports get the same answer.
  it('gives HTTP and the websocket upgrade the same answer, by construction', async () => {
    const { verify } = verifier()

    // `middleware/auth.ts` turns this into a 401; `ws.ts` turns it into a 4401 close.
    // Both read the SAME resolution, which is why a hosted-login user cannot end up
    // with working requests and a dead socket.
    const httpResult = await verify('passport')
    const socketResult = await verify('passport')

    expect(httpResult).toEqual(socketResult)
    expect(socketResult?.userId).toBe('local-from-email')
  })

  it('logs why a resolution failed, without leaking it to the caller', async () => {
    const warn = vi.fn()
    const { verify } = verifier({
      verify: async () => ({ sub: 's', email: 'stranger@example.test' }),
    })

    expect(await verify('passport', { warn } as never)).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('could not resolve'),
      expect.objectContaining({ reason: 'not_a_member' }),
    )
  })
})
