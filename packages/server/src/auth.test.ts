import { type KeyLike } from 'jose'
import { describe, expect, it } from 'vitest'
import { testApp } from './test-helpers'

describe('the door', () => {
  it('asks for a token', async () => {
    const { call } = await testApp()
    expect((await call('GET', '/me', undefined, '')).status).toBe(401)
  })

  it('refuses a valid token with no account, rather than signing it out with a 401', async () => {
    const { call } = await testApp()
    const res = await call('GET', '/me', undefined, 'stranger')
    expect(res.status).toBe(403)
    expect(res.data.code).toBe('NO_ACCOUNT')
  })

  it('refuses a deactivated account, even one that holds a brand', async () => {
    const { call } = await testApp()
    const res = await call('GET', '/brands/casa/state', undefined, 'gone')
    expect(res.data.code).toBe('ACCOUNT_DEACTIVATED')
  })

  it('shows a member only their brands, and another brand reads as missing', async () => {
    const { call } = await testApp()
    const mine = await call('GET', '/brands')
    expect(mine.data.map((b: { id: string }) => b.id)).toEqual(['casa'])
    const other = await call('GET', '/brands/temper/state')
    expect(other.status).toBe(404)
  })

  it('lets an admin reach every brand, in the switcher order', async () => {
    const { call } = await testApp()
    const all = await call('GET', '/brands', undefined, 'admin')
    expect(all.data.map((b: { id: string }) => b.id)).toEqual(['casa', 'temper'])
  })
})

describe('a Supabase token', () => {
  it('is read by its signature, and a token signed by anyone else is refused', async () => {
    const { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } = await import('jose')
    const { supabaseAuth } = await import('./auth')
    const ours = await generateKeyPair('ES256')
    const theirs = await generateKeyPair('ES256')
    const jwk = { ...(await exportJWK(ours.publicKey)), kid: 'k1', alg: 'ES256' }
    const auth = supabaseAuth(
      { jwksUrl: 'https://unused', audience: 'authenticated' },
      createLocalJWKSet({ keys: [jwk] }),
    )
    const token = (key: KeyLike) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
        .setSubject('user-1')
        .setAudience('authenticated')
        .setExpirationTime('1h')
        .sign(key)
    expect(await auth.verifyToken(await token(ours.privateKey))).toEqual({ userId: 'user-1' })
    await expect(auth.verifyToken(await token(theirs.privateKey))).rejects.toThrow()
  })
})
