import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

describe('the environment', () => {
  it('runs on the dev sign-in locally, with PGlite or a database on this machine', () => {
    expect(loadEnv({}).environment).toBe('local')
    expect(() => loadEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/x' })).not.toThrow()
    expect(() => loadEnv({ DATABASE_URL: 'postgres://u:p@[::1]:5432/x' })).not.toThrow()
    expect(loadEnv({}).host).toBe('127.0.0.1')
  })

  it('counts a host named in the query string as remote, since that is where pg connects', () => {
    for (const q of ['host=prod.example.com', 'hostaddr=10.0.0.5', 'host=/var/run/postgresql']) {
      expect(() => loadEnv({ DATABASE_URL: `postgres://u:p@localhost/x?${q}` })).toThrow(
        /dev sign-in/,
      )
    }
  })

  it('refuses the dev sign-in and a pinned clock in production or on a remote database', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/dev sign-in/)
    expect(() => loadEnv({ DATABASE_URL: 'postgres://u:p@db.example.com:5432/x' })).toThrow(
      /dev sign-in/,
    )
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        AUTH_PROVIDER: 'supabase',
        SUPABASE_JWKS_URL: 'https://x.supabase.co/auth/v1/.well-known/jwks.json',
        PIN_NOW: '2026-10-06T04:00:00Z',
      }),
    ).toThrow(/pinned clock/)
  })

  it('needs the key set to check Supabase tokens against', () => {
    expect(() => loadEnv({ AUTH_PROVIDER: 'supabase' })).toThrow(/SUPABASE_JWKS_URL/)
  })
})
