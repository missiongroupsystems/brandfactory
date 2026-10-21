import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

describe('the environment', () => {
  it('refuses dev auth in production, where any token would stand for any user', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })).toThrow(
      /AUTH_PROVIDER/,
    )
  })

  it('refuses dev auth on a real database even when NODE_ENV is unset', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgres://x' })).toThrow(/AUTH_PROVIDER/)
  })

  it('refuses a pinned clock in production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://x',
        AUTH_PROVIDER: 'supabase',
        SUPABASE_JWKS_URL: 'https://x.supabase.co/auth/v1/.well-known/jwks.json',
        PIN_NOW: '2026-10-06T04:00:00Z',
      }),
    ).toThrow(/PIN_NOW/)
  })

  it('refuses the development signing secret and disk storage on a real database', () => {
    let message = ''
    try {
      loadEnv({
        DATABASE_URL: 'postgres://x',
        AUTH_PROVIDER: 'supabase',
        SUPABASE_JWKS_URL: 'https://x.supabase.co/auth/v1/.well-known/jwks.json',
      })
    } catch (err) {
      message = String(err)
    }
    expect(message).toMatch(/MEDIA_SIGNING_SECRET/)
    expect(message).toMatch(/STORAGE_PROVIDER/)
  })

  it('runs locally on PGlite with dev auth and nothing set', () => {
    expect(loadEnv({}).AUTH_PROVIDER).toBe('dev')
  })

  it('takes the Pinterest app as all four variables or none, naming each one missing', () => {
    expect(loadEnv({}).PINTEREST_APP_ID).toBeUndefined()
    let message = ''
    try {
      loadEnv({ PINTEREST_APP_ID: 'app', PINTEREST_APP_SECRET: 'secret' })
    } catch (err) {
      message = String(err)
    }
    expect(message).toMatch(/PINTEREST_REDIRECT_URL/)
    expect(message).toMatch(/TOKEN_ENCRYPTION_KEY/)
    expect(message).not.toMatch(/PINTEREST_APP_SECRET/)
    // A key that is not 32 bytes would seal nothing.
    expect(() =>
      loadEnv({
        PINTEREST_APP_ID: 'app',
        PINTEREST_APP_SECRET: 'secret',
        PINTEREST_REDIRECT_URL: 'http://localhost:3002/connect/pinterest',
        TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64'),
      }),
    ).toThrow(/TOKEN_ENCRYPTION_KEY/)
  })
})
