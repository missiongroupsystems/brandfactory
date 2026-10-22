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

  it('keeps files on disk only on this machine, and needs a long secret to sign them', () => {
    const prod = {
      NODE_ENV: 'production',
      AUTH_PROVIDER: 'supabase',
      SUPABASE_JWKS_URL: 'https://x.supabase.co/auth/v1/.well-known/jwks.json',
    }
    expect(() => loadEnv(prod)).toThrow(/FILES_SECRET/)
    expect(() => loadEnv({ ...prod, FILES_SECRET: 's'.repeat(32) })).toThrow(/on disk/)
    expect(() =>
      loadEnv({ ...prod, FILES_SECRET: 's'.repeat(32), FILES_PROVIDER: 'supabase' }),
    ).toThrow(/SUPABASE_SERVICE_KEY/)
    expect(() => loadEnv({ FILES_SECRET: 'short' })).toThrow(/FILES_SECRET/)
    // Real sign-in outside production still needs its own secret, never the one in the source.
    expect(() =>
      loadEnv({ AUTH_PROVIDER: 'supabase', SUPABASE_JWKS_URL: prod.SUPABASE_JWKS_URL }),
    ).toThrow(/FILES_SECRET/)
    expect(loadEnv({}).disk).toBeDefined()
  })

  it('signs agents’ tokens with a long secret of its own outside this machine', () => {
    const prod = {
      NODE_ENV: 'production',
      AUTH_PROVIDER: 'supabase',
      SUPABASE_JWKS_URL: 'https://x.supabase.co/auth/v1/.well-known/jwks.json',
      FILES_SECRET: 's'.repeat(32),
      FILES_PROVIDER: 'supabase',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_KEY: 'k',
      FILES_BUCKET: 'b',
    }
    expect(() => loadEnv(prod)).toThrow(/AGENT_SECRET/)
    expect(() => loadEnv({ ...prod, AGENT_SECRET: 'short' })).toThrow(/AGENT_SECRET/)
    expect(loadEnv({ ...prod, AGENT_SECRET: 'a'.repeat(32) }).agentSecret).toBe('a'.repeat(32))
    expect(loadEnv({}).agentSecret.length).toBeGreaterThanOrEqual(32)
  })

  it('needs the key set to check Supabase tokens against', () => {
    expect(() => loadEnv({ AUTH_PROVIDER: 'supabase' })).toThrow(/SUPABASE_JWKS_URL/)
  })

  it('plans moves once per connection only when DATABASE_PREPARE is on', () => {
    expect(loadEnv({}).prepare).toBe(false)
    expect(loadEnv({ DATABASE_PREPARE: 'on' }).prepare).toBe(true)
    expect(loadEnv({ DATABASE_PREPARE: '' }).prepare).toBe(false)
    expect(() => loadEnv({ DATABASE_PREPARE: 'yes' })).toThrow(/on or off/)
  })
})
