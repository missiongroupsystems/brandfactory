import { describe, expect, it } from 'vitest'
import type { GroundedRequest, GroundedResult, LLMProvider } from '@brandfactory/adapter-llm'
import { createCreatorLookup, LOOKUP_CREATOR_TIMEOUT_MS } from './lookup'
import type { Logger } from '../logger'
import { testEnv } from '../test-helpers'

// ---------------------------------------------------------------------------
// The composition seam, and the one record this feature leaves behind
// ---------------------------------------------------------------------------
//
// `routes/influencers.test.ts` drives the handler with a fake `lookupCreator`,
// so nothing there exercises this file. What is asserted here is what the seam
// itself decides: the model comes from `env` rather than from the workspace, the
// call is given a deadline, and the money it spends is written down.

/** A logger that keeps what it was told. */
function captureLog(): { log: Logger; lines: { msg: string; fields?: Record<string, unknown> }[] } {
  const lines: { msg: string; fields?: Record<string, unknown> }[] = []
  const log: Logger = {
    debug: () => {},
    info: (msg, fields) => lines.push({ msg, fields }),
    warn: () => {},
    error: () => {},
    child: () => log,
  }
  return { log, lines }
}

function provider(
  result: Partial<GroundedResult>,
  capture?: (req: GroundedRequest) => void,
): LLMProvider {
  const full: GroundedResult = { text: '', retrieved: [], costUsd: null, ...result }
  return {
    getModel: () => {
      throw new Error('getModel: the lookup must not use generateObject')
    },
    completeGrounded: (req: GroundedRequest) => {
      capture?.(req)
      return Promise.resolve(full)
    },
  } as unknown as LLMProvider
}

const GOOD = JSON.stringify({
  outcome: 'ok',
  name: 'Lennard Yeong',
  vertical: 'food',
  accounts: [
    {
      platform: 'instagram',
      handle: 'lennardy',
      followers: 570_000,
      engagementRate: null,
      url: 'https://www.instagram.com/lennardy/',
      sourceUrl: 'https://www.instagram.com/lennardy/',
    },
  ],
})

const RETRIEVED = [{ title: 'lennardy on Instagram', url: 'https://www.instagram.com/lennardy/' }]

describe('createCreatorLookup', () => {
  it('takes the model from env, never from a workspace setting', async () => {
    let seen: GroundedRequest | undefined
    const lookup = createCreatorLookup({
      llm: provider({ text: GOOD, retrieved: RETRIEVED }, (req) => {
        seen = req
      }),
      env: testEnv({ INFLUENCER_LOOKUP_MODEL: 'some/model:online' }),
      log: captureLog().log,
    })

    await lookup({ platform: 'instagram', handle: 'lennardy' })

    // A workspace override would silently remove the web plugin, and the
    // failure looks like every creator not existing. See the seam's docstring.
    expect(seen?.settings.modelId).toBe('some/model:online')
  })

  it('gives the call a deadline', async () => {
    let seen: GroundedRequest | undefined
    const lookup = createCreatorLookup({
      llm: provider({ text: GOOD, retrieved: RETRIEVED }, (req) => {
        seen = req
      }),
      env: testEnv(),
      log: captureLog().log,
    })

    await lookup({ platform: 'instagram', handle: 'lennardy' })

    expect(seen?.signal).toBeInstanceOf(AbortSignal)
    expect(seen?.signal?.aborted).toBe(false)
    expect(LOOKUP_CREATOR_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('writes down what the lookup cost and what it retrieved', async () => {
    // Quick add is stateless by design — no job row — so this log line is the
    // only way a deployment can answer what it spent or why the hit rate fell.
    const { log, lines } = captureLog()
    const lookup = createCreatorLookup({
      llm: provider({ text: GOOD, retrieved: RETRIEVED, costUsd: 0.0182 }),
      env: testEnv({ INFLUENCER_LOOKUP_MODEL: 'some/model:online' }),
      log,
    })

    await lookup({ platform: 'instagram', handle: 'lennardy' })

    expect(lines).toHaveLength(1)
    expect(lines[0]?.fields).toMatchObject({
      platform: 'instagram',
      handle: 'lennardy',
      outcome: 'ok',
      retrieved: 1,
      costUsd: 0.0182,
      model: 'some/model:online',
    })
  })

  it('records a not-found as the paid call it is', async () => {
    const { log, lines } = captureLog()
    const lookup = createCreatorLookup({
      llm: provider({ text: '{"outcome":"not-found","accounts":[]}', costUsd: 0.0174 }),
      env: testEnv(),
      log,
    })

    await lookup({ platform: 'tiktok', handle: 'nobody' })

    expect(lines[0]?.fields).toMatchObject({ outcome: 'not-found', costUsd: 0.0174, retrieved: 0 })
  })

  it('records an unknown cost as null, never as zero', async () => {
    const { log, lines } = captureLog()
    const lookup = createCreatorLookup({
      llm: provider({ text: GOOD, retrieved: RETRIEVED }),
      env: testEnv(),
      log,
    })

    await lookup({ platform: 'instagram', handle: 'lennardy' })

    expect(lines[0]?.fields?.['costUsd']).toBeNull()
  })
})
