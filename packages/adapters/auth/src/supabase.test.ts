import { describe, it, expect, vi } from 'vitest'
import { SignJWT, generateKeyPair, exportJWK, type JWK, type KeyLike } from 'jose'
import { createSupabaseAuthProvider } from './supabase'
import { InvalidTokenError, PasswordNotSupportedError, PasswordRejectedError } from './port'

const ISSUER = 'https://issuer.test'
const AUDIENCE = 'authenticated'

async function makeKeySet() {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = (await exportJWK(publicKey)) as JWK
  jwk.kid = 'test-kid'
  jwk.alg = 'RS256'
  jwk.use = 'sig'
  return { privateKey, jwks: async () => publicKey }
}

async function signToken(privateKey: KeyLike, claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(typeof claims.sub === 'string' ? claims.sub : 'user-1')
    .setIssuedAt()
    .setExpirationTime(typeof claims.exp === 'number' ? claims.exp : '5m')
    .sign(privateKey)
}

describe('createSupabaseAuthProvider', () => {
  it('verifies a valid token and returns the sub as userId', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser: async () => {} },
    )
    const token = await signToken(privateKey, { sub: 'abc-123' })
    const { userId } = await auth.verifyToken(token)
    expect(userId).toBe('abc-123')
  })

  it('rejects an expired token', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser: async () => {} },
    )
    const expiredEpoch = Math.floor(Date.now() / 1000) - 60
    const token = await signToken(privateKey, { sub: 'abc-123', exp: expiredEpoch })
    await expect(auth.verifyToken(token)).rejects.toBeInstanceOf(InvalidTokenError)
  })

  it('rejects a token with no sub claim', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser: async () => {} },
    )
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
    await expect(auth.verifyToken(token)).rejects.toBeInstanceOf(InvalidTokenError)
  })

  it('auto-provisions a user row on first verify when email claim is present', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const ensureUser = vi.fn(async () => {})
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser },
    )
    const token = await signToken(privateKey, { sub: 'abc-123', email: 'a@b.test' })
    await auth.verifyToken(token)
    expect(ensureUser).toHaveBeenCalledTimes(1)
    expect(ensureUser).toHaveBeenCalledWith({ id: 'abc-123', email: 'a@b.test' })
  })

  it('dedupes auto-provisioning: second verify of the same sub skips ensureUser', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const ensureUser = vi.fn(async () => {})
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser },
    )
    const token = await signToken(privateKey, { sub: 'abc-123', email: 'a@b.test' })
    await auth.verifyToken(token)
    await auth.verifyToken(token)
    expect(ensureUser).toHaveBeenCalledTimes(1)
  })

  it('skips auto-provisioning when the email claim is missing', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const ensureUser = vi.fn(async () => {})
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser },
    )
    // No `email` claim on the token.
    const token = await signToken(privateKey, { sub: 'abc-123' })
    const { userId } = await auth.verifyToken(token)
    expect(userId).toBe('abc-123')
    expect(ensureUser).not.toHaveBeenCalled()
  })

  it('does not fail verifyToken when ensureUser throws (DB outage tolerance)', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const ensureUser = vi.fn(async () => {
      throw new Error('connection refused')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null, ensureUser },
    )
    const token = await signToken(privateKey, { sub: 'abc-123', email: 'a@b.test' })
    const { userId } = await auth.verifyToken(token)
    expect(userId).toBe('abc-123')
    expect(warn).toHaveBeenCalledOnce()
    // Dedup set is NOT populated on failure → next call retries.
    await auth.verifyToken(token)
    expect(ensureUser).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})

describe('setPassword', () => {
  it('writes through the admin client and reports nothing back', async () => {
    const calls: Array<{ id: string; password?: string }> = []
    const provider = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/jwks' },
      {
        adminClient: {
          updateUserById: (async (id: string, attrs: { password?: string }) => {
            calls.push({ id, password: attrs.password })
            return { data: { user: null }, error: null }
          }) as never,
        },
      },
    )
    await expect(provider.setPassword('u-1', 'correct-horse-battery')).resolves.toBeUndefined()
    expect(calls).toEqual([{ id: 'u-1', password: 'correct-horse-battery' }])
  })

  function refusing(error: { message: string; status?: number }) {
    return createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/jwks' },
      {
        adminClient: {
          updateUserById: (async () => ({ data: { user: null }, error })) as never,
        },
      },
    )
  }

  it('reports a 4xx as a rejected password, with the rule and not the value', async () => {
    // The person on the set-password screen needs the rule GoTrue refused on,
    // and the route turns this into a 400 they can act on.
    const provider = refusing({ message: 'Password is known to be weak', status: 422 })
    await expect(provider.setPassword('u-1', 'hunter2hunter2hunter2')).rejects.toBeInstanceOf(
      PasswordRejectedError,
    )
    await expect(provider.setPassword('u-1', 'hunter2hunter2hunter2')).rejects.toThrow(
      /known to be weak/,
    )
    await expect(provider.setPassword('u-1', 'hunter2hunter2hunter2')).rejects.not.toThrow(
      /hunter2/,
    )
  })

  it('reports a 5xx as a fault, not as advice to pick another password', async () => {
    // Conflating the two sends somebody who is already locked out to try
    // variations of a password that was never the problem.
    const provider = refusing({ message: 'upstream unavailable', status: 503 })
    const err = await provider.setPassword('u-1', 'correct-horse-battery').catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(PasswordRejectedError)
  })

  it('treats a refusal with no status as a fault rather than guessing', async () => {
    // An error the SDK did not attribute is not evidence the password was bad.
    const provider = refusing({ message: 'something happened' })
    const err = await provider.setPassword('u-1', 'correct-horse-battery').catch((e) => e)
    expect(err).not.toBeInstanceOf(PasswordRejectedError)
  })

  it('refuses without the service key instead of booting without it', async () => {
    // A verify-only deployment should start. It should fail where the act is
    // attempted, with a message naming the two keys — not at startup with a
    // message about a feature it does not use.
    const provider = createSupabaseAuthProvider({ jwksUrl: 'https://example.test/jwks' })
    await expect(provider.setPassword('u-1', 'correct-horse-battery')).rejects.toBeInstanceOf(
      PasswordNotSupportedError,
    )
  })
})
