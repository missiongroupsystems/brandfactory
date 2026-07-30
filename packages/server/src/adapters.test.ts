import { describe, expect, it } from 'vitest'
import { buildAdapters } from './adapters'
import { loadEnv } from './env'

const BASE = {
  DATABASE_URL: 'postgres://x',
  AUTH_PROVIDER: 'local',
  STORAGE_PROVIDER: 'local-disk',
  REALTIME_PROVIDER: 'native-ws',
  LLM_PROVIDER: 'openrouter',
  LLM_MODEL: 'anthropic/claude-sonnet-4.6',
  BLOB_LOCAL_DISK_ROOT: '/tmp/blobs',
  BLOB_SIGNING_SECRET: 'sec',
  BLOB_PUBLIC_BASE_URL: 'http://localhost:3000/blobs',
  OPENROUTER_API_KEY: 'or_key',
}

describe('buildAdapters', () => {
  it('wires the five adapters for the local + native-ws + openrouter combo', () => {
    const env = loadEnv(BASE as NodeJS.ProcessEnv)

    const { auth, storage, realtime, llm, research } = buildAdapters(env)

    expect(typeof auth.verifyToken).toBe('function')
    expect(typeof auth.getUserById).toBe('function')
    expect(typeof storage.put).toBe('function')
    expect(typeof storage.getSignedReadUrl).toBe('function')
    expect(realtime.provider).toBe('native-ws')
    expect(typeof realtime.bus.publish).toBe('function')
    expect(typeof realtime.bus.subscribe).toBe('function')
    expect(typeof realtime.bus.bindToNodeWebSocketServer).toBe('function')
    expect(typeof llm.getModel).toBe('function')
    // Always built, even at `RESEARCH_PROVIDER=none` — the noop refuses loudly
    // rather than leaving every consumer to narrow an optional adapter.
    expect(typeof research.start).toBe('function')
  })

  it('builds the noop research provider by default, and it refuses by name', async () => {
    const env = loadEnv(BASE as NodeJS.ProcessEnv)
    const { research } = buildAdapters(env)
    await expect(research.poll('x')).rejects.toThrow(/RESEARCH_PROVIDER/)
  })

  it('builds the perplexity provider when one is configured with a key', async () => {
    const env = loadEnv({
      ...BASE,
      RESEARCH_PROVIDER: 'perplexity',
      PERPLEXITY_API_KEY: 'pplx-test',
    } as NodeJS.ProcessEnv)
    const { research } = buildAdapters(env)
    // Distinguished by behaviour rather than by identity: the noop rejects
    // before it would ever reach the network, this one tries to reach it.
    await expect(research.poll('x')).rejects.not.toThrow(/RESEARCH_PROVIDER/)
  })
})
