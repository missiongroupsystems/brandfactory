import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type {
  BrandGuidelineSection,
  ResearchDraft,
  ResearchJobSummary,
  UpdateBrandGuidelinesInput,
} from '@brandfactory/shared'
import { useDraftLanding, useResearchArrival } from './useDraftLanding'

const mutate = vi.hoisted(() => vi.fn())
const clearDrafts = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
const toastInfo = vi.hoisted(() => vi.fn())

vi.mock('@/api/queries/brands', () => ({
  useUpdateBrandGuidelines: () => ({ mutate, isPending: false }),
}))

// The writer that stops the rail advertising drafts it has already handed over.
// Mocked at the same level as the guidelines mutation, for the same reason: what
// is under test is *when* the hook decides drafts have landed, not React Query.
vi.mock('@/api/queries/research', () => ({
  useClearResearchDrafts: () => ({ mutate: clearDrafts, isPending: false }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    info: (...args: unknown[]) => toastInfo(...args),
  },
}))

const BRAND_ID = '22222222-2222-4222-8222-222222222222'

function draft(label: string): ResearchDraft {
  return { label, html: `<p>${label}</p>`, text: label, sources: [] }
}

function job(over: Partial<ResearchJobSummary> = {}): ResearchJobSummary {
  return {
    id: 'job-1' as ResearchJobSummary['id'],
    status: 'COMPLETED',
    startedAt: '2026-07-29T10:00:00.000Z',
    completedAt: '2026-07-29T10:04:00.000Z',
    error: null,
    drafts: [draft('Voice & tone'), draft('Target audience')],
    sourceCount: 12,
    ...over,
  }
}

const running = (over: Partial<ResearchJobSummary> = {}) =>
  job({ status: 'IN_PROGRESS', completedAt: null, drafts: [], sourceCount: 0, ...over })

function section(id: string, updatedAt = '2026-07-29T10:00:00.000Z'): BrandGuidelineSection {
  return { id, updatedAt } as BrandGuidelineSection
}

/** The payload of the nth `mutate` call. */
const savedInput = (n = 0) => mutate.mock.calls[n]?.[0] as UpdateBrandGuidelinesInput
/** The `{ onSuccess, onError }` bag of the nth call. */
const handlers = (n = 0) =>
  mutate.mock.calls[n]?.[1] as {
    onSuccess: (s: BrandGuidelineSection[]) => void
    onError: (e: unknown) => void
  }
/** The options the last success toast was given — where Undo lives. */
const lastToastAction = () =>
  (toastSuccess.mock.calls.at(-1)?.[1] as { action?: { label: string; onClick: () => void } })
    ?.action

beforeEach(() => {
  mutate.mockClear()
  clearDrafts.mockClear()
  toastSuccess.mockClear()
  toastError.mockClear()
  toastInfo.mockClear()
})

// ---------------------------------------------------------------------------
// The arrival — a transition, not a state
// ---------------------------------------------------------------------------

describe('useResearchArrival', () => {
  it('fires when a job it watched in flight comes back with drafts', () => {
    const onArrive = vi.fn()
    const { rerender } = renderHook(({ j }) => useResearchArrival(j, onArrive), {
      initialProps: { j: running() as ResearchJobSummary | null },
    })
    expect(onArrive).not.toHaveBeenCalled()

    rerender({ j: job() })

    expect(onArrive).toHaveBeenCalledOnce()
    expect(onArrive.mock.calls[0]?.[0]).toMatchObject({ id: 'job-1' })
  })

  // The property that keeps this from writing to a brand on page load, days
  // after a run, in response to nothing the user just did.
  it('does not fire for a job that was already finished when the hub mounted', () => {
    const onArrive = vi.fn()
    renderHook(() => useResearchArrival(job(), onArrive))

    expect(onArrive).not.toHaveBeenCalled()
  })

  it('fires once, however many times the poll answers', () => {
    const onArrive = vi.fn()
    const { rerender } = renderHook(({ j }) => useResearchArrival(j, onArrive), {
      initialProps: { j: running() as ResearchJobSummary | null },
    })

    rerender({ j: job() })
    rerender({ j: job() })
    rerender({ j: { ...job() } })

    expect(onArrive).toHaveBeenCalledOnce()
  })

  // A re-run is a second arrival — which is what opens E2's sheet by itself on
  // the brand the review sheet exists for.
  it('fires again for a new run on the same brand', () => {
    const onArrive = vi.fn()
    const { rerender } = renderHook(({ j }) => useResearchArrival(j, onArrive), {
      initialProps: { j: running() as ResearchJobSummary | null },
    })
    rerender({ j: job() })

    rerender({ j: running({ id: 'job-2' as ResearchJobSummary['id'] }) })
    rerender({ j: job({ id: 'job-2' as ResearchJobSummary['id'] }) })

    expect(onArrive).toHaveBeenCalledTimes(2)
  })

  // Each of these has a rail row that already says so, and none has anything to
  // land. A completed run with no drafts is 3D's shaping pass having produced
  // nothing — deliberately *not* the same thing as `NO_FINDINGS`.
  it.each([
    ['a failed run', job({ status: 'FAILED', drafts: [], error: 'timed out' })],
    ['nothing found', job({ status: 'NO_FINDINGS', drafts: [] })],
    ['a completed run that shaped nothing', job({ drafts: [] })],
  ])('does not fire for %s', (_name, finished) => {
    const onArrive = vi.fn()
    const { rerender } = renderHook(({ j }) => useResearchArrival(j, onArrive), {
      initialProps: { j: running() as ResearchJobSummary | null },
    })

    rerender({ j: finished })

    expect(onArrive).not.toHaveBeenCalled()
  })

  it('does nothing for a brand nobody has researched', () => {
    const onArrive = vi.fn()
    renderHook(() => useResearchArrival(null, onArrive))

    expect(onArrive).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// The two paths
// ---------------------------------------------------------------------------

/**
 * Both inputs are props rather than closures: the section list changing
 * *between* the arrival and the Undo click is the case the guard is for, so the
 * test has to be able to change it.
 */
function landing(initial: BrandGuidelineSection[] | undefined) {
  const view = renderHook(
    ({ j, s }: { j: ResearchJobSummary | null; s: BrandGuidelineSection[] | undefined }) =>
      useDraftLanding({ brandId: BRAND_ID, sections: s, job: j }),
    { initialProps: { j: running() as ResearchJobSummary | null, s: initial } },
  )
  return {
    result: view.result,
    update: (j: ResearchJobSummary | null, s: BrandGuidelineSection[] | undefined = initial) =>
      view.rerender({ j, s }),
  }
}

describe('useDraftLanding — E1, the empty brand', () => {
  it('writes the drafts as agent-written sections and opens no sheet', () => {
    const { result, update } = landing([])

    update(job())

    expect(savedInput().sections.map((s) => s.label)).toEqual(['Voice & tone', 'Target audience'])
    expect(savedInput().sections.every((s) => s.createdBy === 'agent')).toBe(true)
    expect(result.current.reviewOpen).toBe(false)
  })

  it('reports what landed, and from how many sources, with an Undo', () => {
    const { update } = landing([])
    update(job())

    act(() => handlers().onSuccess([section('a'), section('b')]))

    expect(toastSuccess.mock.calls[0]?.[0]).toBe('2 sections added from 12 sources')
    expect(lastToastAction()?.label).toBe('Undo')
  })

  it('counts one of each without an s', () => {
    const { update } = landing([])
    update(job({ drafts: [draft('Voice & tone')], sourceCount: 1 }))

    act(() => handlers().onSuccess([section('a')]))

    expect(toastSuccess.mock.calls[0]?.[0]).toBe('1 section added from 1 source')
  })

  // Nothing is lost when the write fails — the drafts are still on the job and
  // the rail still offers Review — so this reports and stops rather than
  // putting a dialog on screen in response to an error.
  it('says so when the write fails, and does not fall through to the sheet', () => {
    const { result, update } = landing([])
    update(job())

    act(() => handlers().onError(new Error('nope')))

    expect(toastError).toHaveBeenCalledOnce()
    expect(result.current.reviewOpen).toBe(false)
  })
})

describe('useDraftLanding — E2, the curated brand', () => {
  // **The boundary test.** A deep run takes 3–15 minutes, which is ample time
  // to start typing a Voice section by hand — so emptiness is answered when the
  // drafts land, and a brand that filled up in the interval must be asked, not
  // written to.
  it('opens the review sheet and writes nothing when the brand has a section', () => {
    const { result, update } = landing([section('a')])

    update(job())

    expect(mutate).not.toHaveBeenCalled()
    expect(result.current.reviewOpen).toBe(true)
  })

  // `undefined` is a brand whose sections we do not know — pending, or a failed
  // query. It is not an empty brand, and the difference is a destructive write.
  it('asks rather than acts when the section list is unknown', () => {
    const { result, update } = landing(undefined)

    update(job())

    expect(mutate).not.toHaveBeenCalled()
    expect(result.current.reviewOpen).toBe(true)
  })

  it('stages what was accepted, in order, and closes the sheet', async () => {
    const { result, update } = landing([section('a')])
    update(job())

    act(() => result.current.acceptDrafts([draft('Positioning'), draft('Voice & tone')]))

    await waitFor(() => expect(result.current.reviewOpen).toBe(false))
    expect(result.current.staged?.map((s) => s.label)).toEqual(['Positioning', 'Voice & tone'])
    // Staging only — the editor's own Save is still the single writer.
    expect(mutate).not.toHaveBeenCalled()
  })

  it('clears the staged drafts once the editor has taken them', async () => {
    const { result } = landing([section('a')])
    act(() => result.current.acceptDrafts([draft('Positioning')]))
    await waitFor(() => expect(result.current.staged).not.toBeNull())

    act(() => result.current.clearStaged())

    expect(result.current.staged).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Landing them means the rail stops offering them
// ---------------------------------------------------------------------------
//
// The rail's `N drafts ready — Review` row reads `COMPLETED && drafts.length >
// 0`, and until this pass **nothing ever emptied `drafts`**. So a brand that had
// already taken its drafts advertised them forever, and taking them a second time
// wrote a second copy of every section. `BrandContextRail`'s own fall-through
// comment described "a completed run whose drafts have already been dealt with" —
// a state the code could not reach.
//
// The rule these tests pin down is *when* "dealt with" is true, and it is not the
// same moment on the two paths.

describe('useDraftLanding — recording that the drafts landed', () => {
  it('records E1 the moment the sections are written', () => {
    const { update } = landing([])

    update(job())
    act(() => handlers().onSuccess([section('a')]))

    expect(clearDrafts).toHaveBeenCalledWith('job-1')
  })

  // Nothing was written, so nothing has landed. The drafts are still the only
  // copy of a $0.40 run's output that a re-run would be needed to rebuild.
  it('does not record E1 when the write failed', () => {
    const { update } = landing([])

    update(job())
    act(() => handlers().onError(new Error('nope')))

    expect(clearDrafts).not.toHaveBeenCalled()
  })

  // **The E2 rule.** Accepting stages into an editor the user may still close, so
  // accept is an arming, not a landing.
  it('does not record E2 on accept alone', async () => {
    const { result } = landing([section('a')])

    act(() => result.current.acceptDrafts([draft('Positioning')]))
    await waitFor(() => expect(result.current.staged).not.toBeNull())

    expect(clearDrafts).not.toHaveBeenCalled()
  })

  it('records E2 once the editor reports a save', async () => {
    const { result } = landing([section('a')])
    act(() => result.current.acceptDrafts([draft('Positioning')]))
    await waitFor(() => expect(result.current.staged).not.toBeNull())

    act(() => result.current.onGuidelinesSaved())

    expect(clearDrafts).toHaveBeenCalledWith('job-1')
  })

  // The callback fires on *every* guidelines save. Somebody editing their own
  // sections has nothing to do with a research run, and clearing the drafts then
  // would silently discard a review the user never opened.
  it('ignores a save that no accept armed', () => {
    const { result } = landing([section('a')])

    act(() => result.current.onGuidelinesSaved())

    expect(clearDrafts).not.toHaveBeenCalled()
  })

  it('records once, not on every subsequent save', async () => {
    const { result } = landing([section('a')])
    act(() => result.current.acceptDrafts([draft('Positioning')]))
    await waitFor(() => expect(result.current.staged).not.toBeNull())

    act(() => result.current.onGuidelinesSaved())
    act(() => result.current.onGuidelinesSaved())

    expect(clearDrafts).toHaveBeenCalledTimes(1)
  })
})

describe('useDraftLanding — Undo', () => {
  const written = [section('a'), section('b')]

  it('writes the empty list back through the same single writer', () => {
    const { update } = landing([])
    update(job())
    act(() => handlers().onSuccess(written))
    // What `applyGuidelinesToCache` does for real: the brand now holds exactly
    // the sections that were written, which is the only state Undo may act on.
    update(job(), written)

    act(() => lastToastAction()?.onClick())

    expect(savedInput(1)).toEqual({ sections: [] })
  })

  // The wipe this guard exists to prevent: `[]` means "take back what research
  // added" only while the list is still exactly what research added.
  it('does nothing once a section has been added underneath it', () => {
    const { update } = landing([])
    update(job())
    act(() => handlers().onSuccess(written))
    // The user saved a section of their own while the toast was up.
    update(job(), [...written, section('c')])

    act(() => lastToastAction()?.onClick())

    expect(mutate).toHaveBeenCalledOnce()
    expect(toastInfo).toHaveBeenCalledOnce()
  })

  it('does nothing once a body has been edited underneath it', () => {
    const { update } = landing([])
    update(job())
    act(() => handlers().onSuccess(written))
    update(job(), [section('a', '2026-07-29T10:09:00.000Z'), section('b')])

    act(() => lastToastAction()?.onClick())

    expect(mutate).toHaveBeenCalledOnce()
    expect(toastInfo).toHaveBeenCalledOnce()
  })
})
