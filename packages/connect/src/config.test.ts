import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

const full = {
  PUBLIC_BASE_URL: 'http://localhost:3010/',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  META_APP_ID: 'a',
  META_APP_SECRET: 'b',
  META_CONFIG_ID: 'c',
  PINTEREST_APP_ID: 'd',
  PINTEREST_APP_SECRET: 'e',
  TIKTOK_CLIENT_KEY: 'f',
  TIKTOK_CLIENT_SECRET: 'g',
}

describe('loadConfig', () => {
  it('names every missing variable at once, so startup fails with the whole list', () => {
    expect(() =>
      loadConfig({ ...full, META_APP_SECRET: '', TIKTOK_CLIENT_KEY: undefined }),
    ).toThrow('META_APP_SECRET, TIKTOK_CLIENT_KEY')
  })

  it('refuses an encryption key that is not 32 bytes', () => {
    expect(() => loadConfig({ ...full, TOKEN_ENCRYPTION_KEY: 'c2hvcnQ=' })).toThrow('32 bytes')
  })

  it('accepts a full environment and trims the trailing slash from the base URL', () => {
    expect(loadConfig(full).publicBaseUrl).toBe('http://localhost:3010')
  })
})
