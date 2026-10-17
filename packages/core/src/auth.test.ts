import { type KeyLike, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { describe, expect, it } from 'vitest'
import { supabaseAuth } from './auth'
import { authenticate } from './run'

describe('a Supabase token', () => {
  it('names a person by its signature; anyone else’s, or one with no user, is refused', async () => {
    const ours = await generateKeyPair('ES256')
    const theirs = await generateKeyPair('ES256')
    const jwk = { ...(await exportJWK(ours.publicKey)), kid: 'k1', alg: 'ES256' }
    const auth = supabaseAuth(
      { jwksUrl: 'https://unused', audience: 'authenticated' },
      createLocalJWKSet({ keys: [jwk] }),
    )
    const token = (key: KeyLike, sub?: string, role = 'authenticated') => {
      const jwt = new SignJWT({ role })
        .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
        .setAudience('authenticated')
        .setExpirationTime('1h')
      return (sub ? jwt.setSubject(sub) : jwt).sign(key)
    }
    expect(await authenticate(auth, `Bearer ${await token(ours.privateKey, 'user-1')}`)).toBe(
      'user-1',
    )
    await expect(
      authenticate(auth, `Bearer ${await token(theirs.privateKey, 'user-1')}`),
    ).rejects.toThrow(/invalid token/)
    // A service key names a role, not a person: `core promote` cannot act on one.
    await expect(
      authenticate(auth, `Bearer ${await token(ours.privateKey, undefined, 'service_role')}`),
    ).rejects.toThrow(/invalid token/)
  })
})
