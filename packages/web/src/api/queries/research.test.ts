import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { BrandResearchState, ResearchJobSummary } from '@brandfactory/shared'
import { brandKeys } from './brands'
import {
  applyStartedJobToCache,
  canAutofillSections,
  RESEARCH_POLL_MS,
  researchRefetchInterval,
} from './research'

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

// The availability rule (decision 8), stated once and called by all three
// routes that mount the editor. The server enforces the same gates; this is
// what keeps the sparkle from rendering for a request the server would refuse.
describe('canAutofillSections', () => {
  const URL = 'https://acme.example'

  it('allows a brand with a report, even when research is off', () => {
    // Path R spends the user's own LLM tokens; the report is already paid for.
    expect(canAutofillSections({ enabled: false, job: job('COMPLETED') }, null)).toBe(true)
  })

  it('allows the search path only with a provider and a website', () => {
    expect(canAutofillSections({ enabled: true, job: null }, URL)).toBe(true)
    // The Casa Vostra rule: no website, no search — the server would 400.
    expect(canAutofillSections({ enabled: true, job: null }, null)).toBe(false)
    expect(canAutofillSections({ enabled: false, job: null }, URL)).toBe(false)
  })

  it('does not treat NO_FINDINGS or a failed run as a report', () => {
    // Their "report" is the finder's apology; the server falls through to
    // search, so the gate asks the search path's questions instead.
    expect(canAutofillSections({ enabled: false, job: job('NO_FINDINGS') }, URL)).toBe(false)
    expect(canAutofillSections({ enabled: false, job: job('FAILED') }, URL)).toBe(false)
  })

  it('is closed while the query has not answered', () => {
    expect(canAutofillSections(undefined, URL)).toBe(false)
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

  // The POST response is the *job*. It says nothing about the deployment, so
  // the ceiling has to be carried across or the in-flight row loses the sentence
  // naming it the moment a run is started from this screen.
  it('carries the deployment ceiling across a start', () => {
    qc.setQueryData(brandKeys.research(BRAND_ID), { enabled: true, maxMinutes: 25, job: null })
    applyStartedJobToCache(qc, BRAND_ID, job('IN_PROGRESS'))
    expect(qc.getQueryData<BrandResearchState>(brandKeys.research(BRAND_ID))?.maxMinutes).toBe(25)
  })

  // A brand researched straight from the create dialog has no previous entry to
  // carry from. Absent is the honest answer for the one poll interval it
  // survives — a default would be a number stated with confidence that nobody
  // configured, which is the fabrication this whole feature guards against.
  it('does not invent a ceiling when nothing is cached yet', () => {
    applyStartedJobToCache(qc, BRAND_ID, job('IN_PROGRESS'))
    expect(
      qc.getQueryData<BrandResearchState>(brandKeys.research(BRAND_ID))?.maxMinutes,
    ).toBeUndefined()
  })

  it('replaces a finished job with the new run', () => {
    qc.setQueryData(brandKeys.research(BRAND_ID), { enabled: true, job: job('NO_FINDINGS') })
    applyStartedJobToCache(qc, BRAND_ID, job('IN_PROGRESS'))
    expect(qc.getQueryData<BrandResearchState>(brandKeys.research(BRAND_ID))?.job?.status).toBe(
      'IN_PROGRESS',
    )
  })
})
