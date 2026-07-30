import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { BrandGuidelineSection, ResearchDraft, ResearchJobSummary } from '@brandfactory/shared'
import { hasDraftsReady } from '@brandfactory/shared'
import { AppError } from '@/api/client'
import { useUpdateBrandGuidelines } from '@/api/queries/brands'
import { useClearResearchDrafts } from '@/api/queries/research'
import type { StagedSection } from '@/components/brand/BrandGuidelinesEditor'
import {
  draftsToSections,
  draftsToStaged,
  sectionsUnchanged,
} from '@/components/brand/researchDrafts'

// ---------------------------------------------------------------------------
// Landing the drafts — two paths off one condition (Stage 3E)
// ---------------------------------------------------------------------------
//
//   the empty brand    → populate, and offer an Undo          (E1)
//   the curated brand  → open the review sheet                (E2)
//
// **The condition is evaluated when the drafts land, not at submission.** A
// deep run takes 3–15 minutes, which is ample time to start typing a Voice
// section by hand — so a brand that was empty when you clicked *Research this
// brand* need not be empty when the report comes back, and writing over what
// you typed in the interval would be the worst thing this feature could do.
//
// This lives in a hook rather than in `routes/brands.$brandId.tsx` for the
// reason the rest of the hub does: the route is the data half and mounts a
// router, a QueryClient and four dialogs, none of which the decision above
// depends on. The boundary test — *a job that completes while the user has
// typed one section takes E2* — is the phase's load-bearing test, and it should
// not need a rendered page to state.

/**
 * Fire once when a job **we watched in flight** comes back with drafts.
 *
 * Three properties, each of which is a bug if dropped:
 *
 * - **A transition, not a state.** The hook remembers the id of a job it saw
 *   `IN_PROGRESS`, and only that job can arrive. A hub that mounts on an
 *   already-complete run has not witnessed anything — it renders the rail's
 *   `N drafts ready — Review` row and waits to be clicked. The alternative is a
 *   silent write to the brand's guidelines on page load, days after the run,
 *   triggered by nothing the user just did.
 * - **Once per job.** The query polls every 5 seconds and re-renders on every
 *   answer; the arrival is a moment, not a status.
 * - **A new run arrives again.** The id is the key, so re-running research on
 *   the same brand is a second arrival — which is what makes E2's sheet open by
 *   itself on the re-run the review sheet exists for.
 *
 * Only `COMPLETED` *with drafts* arrives. `FAILED`, `NO_FINDINGS` and a
 * completed run whose shaping pass produced nothing all have a rail row that
 * says so, and none of them has anything to land.
 */
export function useResearchArrival(
  job: ResearchJobSummary | null | undefined,
  onArrive: (job: ResearchJobSummary) => void,
): void {
  const watchedRef = useRef<string | null>(null)
  const handledRef = useRef<Set<string>>(new Set())
  // Read at fire time, so a caller that rebuilds the callback each render does
  // not re-run the effect — and cannot miss an arrival by having done so.
  //
  // Synced in an effect rather than during render: refs are not render values
  // (`react-hooks/refs` says so, and enforces it), and the ordering this needs
  // is already guaranteed — effects run in declaration order, so this one has
  // landed before the arrival effect below reads it in the same commit. Same
  // idiom as `BrandGuidelinesEditor`'s `saveRef`.
  const onArriveRef = useRef(onArrive)
  useEffect(() => {
    onArriveRef.current = onArrive
  })

  useEffect(() => {
    if (!job) return
    if (job.status === 'IN_PROGRESS') {
      watchedRef.current = job.id
      return
    }
    if (watchedRef.current !== job.id) return
    if (!hasDraftsReady(job) || handledRef.current.has(job.id)) return
    handledRef.current.add(job.id)
    onArriveRef.current(job)
  }, [job])
}

export interface DraftLanding {
  /** E2's sheet. Also opened by the rail's `N drafts ready` row. */
  reviewOpen: boolean
  setReviewOpen: (open: boolean) => void
  /** Accepted drafts on their way into the editor. Null when there are none. */
  staged: StagedSection[] | null
  clearStaged: () => void
  /** What the review sheet's *Accept selected* hands back. */
  acceptDrafts: (drafts: ResearchDraft[]) => void
  /**
   * The guidelines editor saved. **The other half of E2's landing** — see
   * `onGuidelinesSaved`.
   */
  onGuidelinesSaved: () => void
}

export function useDraftLanding({
  brandId,
  sections,
  job,
}: {
  brandId: string
  /** The brand's current sections, or `undefined` while the query is pending. */
  sections: BrandGuidelineSection[] | undefined
  job: ResearchJobSummary | null | undefined
}): DraftLanding {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [staged, setStaged] = useState<StagedSection[] | null>(null)
  const mutation = useUpdateBrandGuidelines(brandId)
  const clearDrafts = useClearResearchDrafts(brandId)

  // **Which job's drafts are waiting to be recorded as landed.**
  //
  // Held rather than acted on immediately, because "landed" is not the same
  // moment on the two paths. E1 writes the sections itself, so its `onSuccess`
  // *is* the landing. E2 only stages them into the editor — the user still names,
  // trims and saves, and may close the dialog instead. Clearing on accept would
  // make an unsaved cancel cost a $0.40 re-run; clearing on the save that
  // consumed them costs nothing and is true.
  const pendingLandRef = useRef<string | null>(null)
  const clearDraftsRef = useRef(clearDrafts.mutate)
  useEffect(() => {
    clearDraftsRef.current = clearDrafts.mutate
  })

  const recordLanded = useCallback((jobId: string) => {
    pendingLandRef.current = null
    // Fire-and-forget: the sections are already saved, and the mutation swallows
    // its own failure. See `useClearResearchDrafts`.
    clearDraftsRef.current(jobId)
  }, [])

  // Both of these are read at fire time — an arrival lands minutes after the
  // render that armed it, and Undo lands seconds after the toast. Closing over
  // either would answer with the state as it was, which for `sections` is
  // precisely the question being asked.
  const sectionsRef = useRef(sections)
  const mutateRef = useRef(mutation.mutate)
  // The job, for the same reason: accepting drafts arms a landing that is
  // recorded on a later save, and the 5-second poll may have replaced the object
  // by then.
  const jobRef = useRef(job)
  // Declared above `useResearchArrival`, so this commit's sections are in the
  // ref before the arrival effect reads them — see the note on `onArriveRef`.
  useEffect(() => {
    sectionsRef.current = sections
    mutateRef.current = mutation.mutate
    jobRef.current = job
  })

  /**
   * Undo: write the empty list back through the **same single writer**, and
   * do nothing at all if the section list moved underneath us.
   *
   * The guard is not politeness. `PATCH /brands/:id/guidelines` takes the
   * brand's complete list, so `[]` deletes everything it finds — correct while
   * the only things there are the five sections we just added, and a total wipe
   * one save later. An Undo firing against an edited brand is exactly the
   * accident decision 8 exists to prevent, so it is checked rather than raced.
   */
  const undo = useCallback((written: BrandGuidelineSection[]) => {
    if (!sectionsUnchanged(sectionsRef.current ?? [], written)) {
      toast.info('Your guidelines changed since — Undo did nothing, on purpose.')
      return
    }
    mutateRef.current(
      { sections: [] },
      {
        onSuccess: () => toast.success('Research sections removed'),
        onError: (err: unknown) =>
          toast.error(err instanceof AppError ? err.message : 'Could not undo'),
      },
    )
  }, [])

  /** E1. The first producer of `createdBy: 'agent'` — see `draftsToSections`. */
  const populate = useCallback(
    (arrived: ResearchJobSummary) => {
      mutateRef.current(
        { sections: draftsToSections(arrived.drafts) },
        {
          onSuccess: (saved: BrandGuidelineSection[]) => {
            // Written, so the rail must stop offering them. Undo does **not** put
            // them back, and that is the honest reading of the gesture: Undo means
            // "I did not want these", so re-advertising them would be arguing.
            recordLanded(arrived.id)
            toast.success(
              `${plural(saved.length, 'section')} added from ${plural(arrived.sourceCount, 'source')}`,
              { action: { label: 'Undo', onClick: () => undo(saved) } },
            )
          },
          // Nothing is lost when this fails: the drafts are still on the job,
          // and the rail's `N drafts ready — Review` row still opens the sheet.
          // So this reports and stops rather than falling through to E2, which
          // would put a dialog on screen in response to an error.
          onError: (err: unknown) =>
            toast.error(
              err instanceof AppError ? err.message : 'Could not add the research sections',
            ),
        },
      )
    },
    [undo, recordLanded],
  )

  useResearchArrival(
    job,
    useCallback(
      (arrived) => {
        const known = sectionsRef.current
        // `undefined` is a brand whose sections we do not know — pending, or a
        // failed query. It is **not** an empty brand, and the difference is a
        // write: E2 asks, E1 acts, so an unknown list takes the one that asks.
        if (known && known.length === 0) populate(arrived)
        else setReviewOpen(true)
      },
      [populate],
    ),
  )

  const acceptDrafts = useCallback((drafts: ResearchDraft[]) => {
    setReviewOpen(false)
    // Staging only. The sheet has no writer of its own — accepting puts the
    // drafts in the ordinary editor with an ordinary Save, which is what keeps
    // `PATCH /brands/:id/guidelines` down to one caller on the client.
    setStaged(draftsToStaged(drafts))
    // Armed, not recorded. The save is what makes them landed — see
    // `pendingLandRef`. Read from the ref at fire time because the job can be
    // re-polled between accepting and saving.
    pendingLandRef.current = jobRef.current?.id ?? null
  }, [])

  const clearStaged = useCallback(() => setStaged(null), [])

  /**
   * E2's landing, completed. The editor saved, and if that save was the one
   * carrying accepted drafts, they are now in the guidelines.
   *
   * Fires on **every** guidelines save, and the `pendingLandRef` check is what
   * makes that harmless: a save with nothing armed is somebody editing their own
   * sections, which has no bearing on a research run.
   */
  const onGuidelinesSaved = useCallback(() => {
    const jobId = pendingLandRef.current
    if (jobId) recordLanded(jobId)
  }, [recordLanded])

  return { reviewOpen, setReviewOpen, staged, clearStaged, acceptDrafts, onGuidelinesSaved }
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}
