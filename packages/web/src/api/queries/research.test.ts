import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { BrandResearchState, ResearchJobSummary } from '@brandfactory/shared'
import { brandKeys } from './brands'
import { applyStartedJobToCache, RESEARCH_POLL_MS, researchRefetchInterval } from './research'

const BRAND_ID = '22222222-2222-4222-8222-222222222222'

function job(status: ResearchJobSummary['status']): ResearchJobSummary {
  return {
    id: 'j-1' as ResearchJobSummary['id'],
    status,
    startedAt: '2026-07-29T09:00:00.000Z',
    completedAt: null,
    error: null,
    drafts: [],
    sourceCount: 0,
  }
}

let qc: QueryClient

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('researchRefetchInterval', () => {
  // The poll has to stop on its own. Almost every brand has no job at all, and
  // a fixed interval would have every open hub tab asking a question with a
  // permanent answer, forever.
  it('polls only while a job is in flight', () => {
    expect(researchRefetchInterval({ enabled: true, job: job('IN_PROGRESS') })).toBe(
      RESEARCH_POLL_MS,
    )
    for (const status of ['COMPLETED', 'FAILED', 'NO_FINDINGS', 'CANCELLED'] as const) {
      expect(researchRefetchInterval({ enabled: true, job: job(status) })).toBe(false)
    }
  })

  it('does not poll a brand with no job, or a query that has not answered', () => {
    expect(researchRefetchInterval({ enabled: true, job: null })).toBe(false)
    expect(researchRefetchInterval(undefined)).toBe(false)
  })
})

describe('applyStartedJobToCache', () => {
  it('writes the started job in place of the previous state', () => {
    qc.setQueryData(brandKeys.research(BRAND_ID), { enabled: true, job: null })
    applyStartedJobToCache(qc, BRAND_ID, job('IN_PROGRESS'))

    const state = qc.getQueryData<BrandResearchState>(brandKeys.research(BRAND_ID))
    expect(state).toEqual({ enabled: true, job: job('IN_PROGRESS') })
  })

  // Defaulting to `false` would make the rail's row vanish at the moment it
  // finally has something to say.
  it('assumes the feature is on when nothing is cached yet', () => {
    applyStartedJobToCache(qc, BRAND_ID, job('IN_PROGRESS'))
    expect(qc.getQueryData<BrandResearchState>(brandKeys.research(BRAND_ID))?.enabled).toBe(true)
  })

  it('replaces a finished job with the new run', () => {
    qc.setQueryData(brandKeys.research(BRAND_ID), { enabled: true, job: job('NO_FINDINGS') })
    applyStartedJobToCache(qc, BRAND_ID, job('IN_PROGRESS'))
    expect(qc.getQueryData<BrandResearchState>(brandKeys.research(BRAND_ID))?.job?.status).toBe(
      'IN_PROGRESS',
    )
  })
})
