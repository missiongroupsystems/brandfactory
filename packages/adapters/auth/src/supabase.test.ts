import { describe, it, expect } from 'vitest'
import { SignJWT, generateKeyPair, exportJWK, type JWK, type KeyLike } from 'jose'
import { createSupabaseAuthProvider, type AdminApi } from './supabase'
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
      { jwks, getUserById: async () => null },
    )
    const token = await signToken(privateKey, { sub: 'abc-123' })
    const { userId } = await auth.verifyToken(token)
    expect(userId).toBe('abc-123')
  })

  it('rejects an expired token', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null },
    )
    const expiredEpoch = Math.floor(Date.now() / 1000) - 60
    const token = await signToken(privateKey, { sub: 'abc-123', exp: expiredEpoch })
    await expect(auth.verifyToken(token)).rejects.toBeInstanceOf(InvalidTokenError)
  })

  it('rejects a token with no sub claim', async () => {
    const { privateKey, jwks } = await makeKeySet()
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null },
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

  it('provisions nothing — the door Phase C closed', async () => {
    // This provider used to insert a `users` row for any `sub` whose token
    // carried an email it had never seen, and the shared-access model then
    // admitted that row to every brand. Anybody who read the public anon key
    // out of the deployed bundle, signed up with an address they controlled
    // and signed in reached the whole estate.
    //
    // There is no `ensureUser` dep to assert against any more, so this test
    // asserts the consequence instead: a verified token whose `sub` has no row
    // resolves to the id and nothing else. The refusal is the middleware's.
    const { privateKey, jwks } = await makeKeySet()
    const lookups: string[] = []
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      {
        jwks,
        getUserById: async (id) => {
          lookups.push(id)
          return null
        },
      },
    )
    const token = await signToken(privateKey, { sub: 'abc-123', email: 'stranger@elsewhere.test' })
    const { userId } = await auth.verifyToken(token)
    expect(userId).toBe('abc-123')
    // Not even read during verification — nothing here touches `users`.
    expect(lookups).toEqual([])
    expect(await auth.getUserById('abc-123')).toBeNull()
  })

  it('resolves by sub and never by the email claim', async () => {
    // The email is on the token and is the one field that would let this
    // function find a row by address. Doing that would reintroduce a second
    // way for a `users` row to be chosen, and on a path that hands out a
    // session "find the user with this email" is how somebody is
    // authenticated as the wrong person when two rows differ only in case.
    const { privateKey, jwks } = await makeKeySet()
    const auth = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys', audience: AUDIENCE, issuer: ISSUER },
      { jwks, getUserById: async () => null },
    )
    const token = await signToken(privateKey, { sub: 'the-sub', email: 'someone@else.test' })
    const { userId } = await auth.verifyToken(token)
    expect(userId).toBe('the-sub')
  })
})

/** Only the method under test is real; the rest throw if a test reaches them. */
function adminStub(over: Partial<AdminApi>): AdminApi {
  const unused = (name: string) => () => {
    throw new Error(`${name} should not be called by this test`)
  }
  return {
    updateUserById: unused('updateUserById'),
    createUser: unused('createUser'),
    deleteUser: unused('deleteUser'),
    ...over,
  } as AdminApi
}

describe('setPassword', () => {
  it('writes through the admin client and reports nothing back', async () => {
    const calls: Array<{ id: string; password?: string }> = []
    const provider = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/jwks' },
      {
        adminClient: adminStub({
          updateUserById: (async (id: string, attrs: { password?: string }) => {
            calls.push({ id, password: attrs.password })
            return { data: { user: null }, error: null }
          }) as never,
        }),
      },
    )
    await expect(provider.setPassword('u-1', 'correct-horse-battery')).resolves.toBeUndefined()
    expect(calls).toEqual([{ id: 'u-1', password: 'correct-horse-battery' }])
  })

  function refusing(error: { message: string; status?: number }) {
    return createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/jwks' },
      {
        adminClient: adminStub({
          updateUserById: (async () => ({ data: { user: null }, error })) as never,
        }),
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

describe('createUser', () => {
  it('creates a confirmed account with the password and returns its id', async () => {
    // `users.id` *is* this id. A row written with any other value collides on
    // `email` the first time its owner signs in, and the adapter swallows that
    // error — leaving a row nothing can reach.
    const calls: Array<{ email: string; password?: string; email_confirm?: boolean }> = []
    const provider = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys' },
      {
        adminClient: adminStub({
          createUser: (async (attrs: {
            email: string
            password?: string
            email_confirm?: boolean
          }) => {
            calls.push(attrs)
            return { data: { user: { id: 'new-sub' } }, error: null }
          }) as never,
        }),
      },
    )
    expect(
      await provider.createUser({ email: 'a@b.test', password: 'correct-horse-battery' }),
    ).toEqual({ userId: 'new-sub' })
    expect(calls).toEqual([
      { email: 'a@b.test', password: 'correct-horse-battery', email_confirm: true },
    ])
  })

  it('reports a 4xx as the administrator’s to fix', async () => {
    // A duplicate address and a rejected password both land here, and the
    // message names which one it was.
    const provider = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys' },
      {
        adminClient: adminStub({
          createUser: (async () => ({
            data: { user: null },
            error: {
              message: 'A user with this email address has already been registered',
              status: 422,
            },
          })) as never,
        }),
      },
    )
    await expect(provider.createUser({ email: 'a@b.test', password: 'x' })).rejects.toBeInstanceOf(
      PasswordRejectedError,
    )
  })

  it('throws when the provider answers without an id rather than returning a blank one', async () => {
    // A `{ userId: '' }` here would be written into `users.id`, and the row
    // would be unreachable with nothing having failed.
    const provider = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys' },
      {
        adminClient: adminStub({
          createUser: (async () => ({ data: { user: null }, error: null })) as never,
        }),
      },
    )
    await expect(provider.createUser({ email: 'a@b.test' })).rejects.toThrow(/no user id/)
  })
})

describe('setSuspended', () => {
  it('bans for about a century, and lifts with none', async () => {
    const calls: Array<string | undefined> = []
    const provider = createSupabaseAuthProvider(
      { jwksUrl: 'https://example.test/keys' },
      {
        adminClient: adminStub({
          updateUserById: (async (_id: string, attrs: { ban_duration?: string }) => {
            calls.push(attrs.ban_duration)
            return { data: { user: null }, error: null }
          }) as never,
        }),
      },
    )
    await provider.setSuspended('u-1', true)
    await provider.setSuspended('u-1', false)
    // Reversible on purpose: for nine people a deactivation is nearly always
    // temporary, which is why this is a ban and not a delete.
    expect(calls).toEqual(['876600h', 'none'])
  })
})
