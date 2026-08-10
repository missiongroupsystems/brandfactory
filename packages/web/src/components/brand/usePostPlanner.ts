import { useState } from 'react'
import { toast } from 'sonner'
import type {
  BrandWithSections,
  CreateSocialPostInput,
  IdeateOutcome,
  IdeatePillar,
  PostIdea,
  SocialPlatform,
  SocialPost,
  UpdateBrandGuidelinesSectionInput,
} from '@brandfactory/shared'
import {
  brandContentPillars,
  CONTENT_PILLARS_SECTION_LABEL,
  contentPillarsDoc,
  sameSectionLabel,
} from '@brandfactory/shared'
import { useUpdateBrandGuidelines } from '@/api/queries/brands'
import { useIdeateCopy, useIdeateThemes } from '@/api/queries/social-ideas'
import type { PostPlannerPanelProps } from '@/components/brand/PostPlannerPanel'
import { DEFAULT_POST_TIME, localPartsToIso } from '@/lib/calendar'
import type { KeyDate } from '@/lib/key-dates'
import {
  chunkCopyPairs,
  commitPairs,
  inferCadence,
  inferPlatforms,
  initialSelections,
  keyDatesInWindow,
  plannedInWindow,
  plannerBatchSize,
  plannerWindow,
  takenSlots,
  type IdeaSelection,
  type PlannerWindowChoice,
} from '@/lib/social-plan'

// ---------------------------------------------------------------------------
// usePostPlanner — the planner's state, which belongs to the page
// ---------------------------------------------------------------------------
//
// `PostPlannerPanel` is pure and holds nothing. Everything it renders lives
// here, and this is called by `SocialCalendarPage` — so the state *is* the
// page's, factored out of it for the reason `useDraftLanding` was: the page
// already owns nine pieces of state and eight handlers for the dialog, the list
// and the uploads, and a run with three stages and two paid calls would double
// that file without sharing a line with any of it.
//
// **Two rules with no exception, and both are asserted in tests.**
//
//   1. The planner never proposes onto a taken day+platform. `takenSlots` is
//      built from `postsByDayPlatform` — the same arithmetic the sentence under
//      the month's header uses — and `applyBoundaries` drops on the server
//      whatever the model returns anyway.
//   2. **Every commit is an insert.** This hook calls `createPost` and nothing
//      else. It holds no update mutation, which is what makes the rule
//      structural rather than remembered.

/** What the page spreads onto the panel, plus the two things only it needs. */
export interface PostPlanner {
  open: boolean
  onOpen: () => void
  /** Everything `PostPlannerPanel` takes except the brand it plans for. */
  panel: Omit<PostPlannerPanelProps, 'brand'>
}

export interface UsePostPlannerOptions {
  brandId: string
  brand: BrandWithSections | undefined
  posts: SocialPost[]
  /** The enabled sets' dates, as the grid already holds them. */
  keyDates: KeyDate[]
  /** The month on screen — the `This month` window. */
  cursor: { year: number; month: number }
  now?: Date
  /**
   * The one writer. `useCreateSocialPost`'s `mutateAsync`, passed in rather
   * than mounted here, so this surface keeps exactly one create mutation and
   * one cache applier behind it.
   */
  createPost: (input: CreateSocialPostInput) => Promise<SocialPost>
  /** The page's toast, so every failure on this surface reads the same way. */
  onError: (err: unknown, fallback: string) => void
}

export function usePostPlanner({
  brandId,
  brand,
  posts,
  keyDates,
  cursor,
  now,
  createPost,
  onError,
}: UsePostPlannerOptions): PostPlanner {
  const themes = useIdeateThemes(brandId)
  const copy = useIdeateCopy(brandId)
  const saveGuidelines = useUpdateBrandGuidelines(brandId)

  const [open, setOpen] = useState(false)
  const [windowChoice, setWindowChoice] = useState<PlannerWindowChoice>('month')
  // **Overrides, not seeds.** The inferred values are derived on every render
  // from the post list, which arrives one round trip after this hook first
  // runs; a `useState(() => inferCadence(posts))` would freeze the answer at
  // *no history* for every brand and never correct itself. `null` means "the
  // measurement", and a number means "what the user typed instead".
  const [cadenceOverride, setCadence] = useState<number | null>(null)
  const [platformOverride, setPlatforms] = useState<SocialPlatform[] | null>(null)

  const [ideas, setIdeas] = useState<PostIdea[] | null>(null)
  const [pillars, setPillars] = useState<IdeatePillar[]>([])
  const [selections, setSelections] = useState<IdeaSelection[]>([])
  const [outcome, setOutcome] = useState<IdeateOutcome | null>(null)
  const [writing, setWriting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  // A brand switch inside the app must not carry the previous brand's run into
  // the new one — the render-phase reset `SocialCalendarPage` already uses for
  // its key-date sets, and for the same reason a `useEffect` is wrong here: it
  // would paint one frame of the wrong brand's ideas before correcting itself.
  const [seededFor, setSeededFor] = useState(brandId)
  if (seededFor !== brandId) {
    setSeededFor(brandId)
    setOpen(false)
    setCadence(null)
    setPlatforms(null)
    reset()
  }

  const clock = now ?? new Date()
  // Named `planWindow`, not `window`: a local called `window` shadows the DOM
  // global for the whole hook, so anything later reaching for `window.matchMedia`
  // would silently get a date range instead.
  const planWindow = plannerWindow(windowChoice, cursor, clock)
  const inferred = inferCadence(posts, clock)
  const cadence = cadenceOverride ?? inferred.perWeek
  const platforms = platformOverride ?? inferPlatforms(posts)
  const batch = plannerBatchSize(planWindow.weeks, cadence)
  const windowKeyDates = keyDates.filter(
    (d) => d.start <= planWindow.end && (d.end ?? d.start) >= planWindow.start,
  )

  function reset() {
    setIdeas(null)
    setPillars([])
    setSelections([])
    setOutcome(null)
    setProgress(null)
  }

  /** Pass 1. Nothing is written and nothing is spent until this is pressed. */
  async function run() {
    if (!brand || platforms.length === 0) return
    setOutcome(null)
    try {
      const result = await themes.mutateAsync({
        window: { start: planWindow.start, end: planWindow.end },
        platforms,
        keyDates: keyDatesInWindow(keyDates, planWindow),
        // Rule 1, and the only place the client states it: the same map the
        // month's sentence is computed from, narrowed to the window so the
        // schema's ceiling can never drop a pair that could collide.
        taken: takenSlots(posts, planWindow),
        cadencePerWeek: cadence,
        pillars: brandContentPillars(brand.sections),
        count: batch.count,
      })
      setOutcome(result.outcome)
      // An honest empty answer leaves the brief standing with its line, rather
      // than opening an ideas stage with nothing in it.
      if (result.outcome !== 'ok') return
      setIdeas(result.ideas)
      setPillars(result.pillars)
      setSelections(initialSelections(result.ideas))
    } catch (err) {
      onError(err, 'Could not plan this window')
    }
  }

  /**
   * Stage 3: pass 2 over the accepted pairs, then one insert each.
   *
   * **The copy pass degrades; the writes do not.** A chunk that fails — thrown,
   * or answered off-schema — commits its rows with `body: ''`, which
   * `social/post.ts` already defines as *slot claimed, copy pending*. The user
   * agreed to these posts; losing them because a caption did not arrive would
   * throw away the decision rather than the words, and the toast says exactly
   * how many landed without their copy.
   */
  async function commit() {
    if (!ideas) return
    const pairs = commitPairs(ideas, selections)
    if (pairs.length === 0) return

    setWriting(true)
    setProgress({ done: 0, total: pairs.length })
    try {
      const bodies = await writeCopy(pairs)
      let done = 0
      for (const [index, pair] of pairs.entries()) {
        try {
          await createPost({
            platform: pair.platform,
            // A dateless idea creates an unscheduled row — the tray, which
            // `SocialPostList` already describes as exactly this.
            scheduledAt: pair.idea.date ? localPartsToIso(pair.idea.date, DEFAULT_POST_TIME) : null,
            body: bodies[index] ?? '',
            // Every planner row is a draft: the reviewable pile is
            // `createdBy === 'agent' && status === 'draft'`, and a row that
            // arrived `ready` would claim a review that never happened.
            status: 'draft',
            createdBy: 'agent',
          })
          done += 1
          setProgress({ done, total: pairs.length })
        } catch (err) {
          // A failed write toasts and the loop continues. Sequential is what
          // lets the summary name how many landed — `handleUploadFiles`'
          // judgment, for the same reason.
          onError(err, `Could not create “${pair.idea.title}”`)
        }
      }
      toast(`Created ${done} of ${pairs.length} ${pairs.length === 1 ? 'post' : 'posts'}`)
      if (done > 0) {
        reset()
        setOpen(false)
      }
    } finally {
      setWriting(false)
      setProgress(null)
    }
  }

  /** Pass 2, chunked to the validator's ceiling. One body per pair, by position. */
  async function writeCopy(
    pairs: { idea: PostIdea; platform: SocialPlatform }[],
  ): Promise<string[]> {
    const bodies: string[] = []
    let missing = 0
    for (const chunk of chunkCopyPairs(pairs)) {
      try {
        const result = await copy.mutateAsync({ items: chunk })
        if (result.outcome === 'ok') {
          // `writePostCopy` returns one entry per requested item, in request
          // order — it rebuilds the answer by position precisely so the caller
          // does not have to read `copy.index`. So the join is the position
          // inside this chunk, and a short answer pads with the empty body that
          // the engine has already filled in.
          chunk.forEach((_, i) => bodies.push(result.copies[i]?.body ?? ''))
          continue
        }
      } catch (err) {
        onError(err, 'Could not write the copy for some of these posts')
      }
      missing += chunk.length
      for (const _ of chunk) bodies.push('')
    }
    if (missing > 0) {
      toast(
        `${missing} ${missing === 1 ? 'post has' : 'posts have'} no copy yet — write it in the editor.`,
      )
    }
    return bodies
  }

  /**
   * Save the run's proposed pillars into the brand's `Content pillars` section.
   *
   * **The only guidelines write in this whole feature, and it happens because
   * the user pressed a button** — never as a side effect of running the
   * planner. It is the fix for pillars drifting between runs, and the proposed
   * marker beside it is what tells the user the fix exists.
   *
   * The payload is the brand's *complete* section list, which
   * `UpdateBrandGuidelinesSectionInput` requires: a partial one silently
   * rewrites every other section's author.
   */
  async function savePillars() {
    if (!brand) return
    const names = pillars.map((p) => p.name)
    if (names.length === 0) return

    const existing: UpdateBrandGuidelinesSectionInput[] = brand.sections.map((section) => ({
      id: section.id,
      label: section.label,
      body: section.body,
      priority: section.priority,
      createdBy: section.createdBy,
    }))
    const index = existing.findIndex((s) =>
      sameSectionLabel(s.label, CONTENT_PILLARS_SECTION_LABEL),
    )
    const current = index === -1 ? undefined : existing[index]
    // `'agent'` because that is who wrote them. The label the user sees stays
    // whatever they typed — an existing `content pillars` row keeps its own
    // spelling rather than being renamed by a save it did not ask for.
    const written: UpdateBrandGuidelinesSectionInput = current
      ? { ...current, body: contentPillarsDoc(names), createdBy: 'agent' }
      : {
          label: CONTENT_PILLARS_SECTION_LABEL,
          body: contentPillarsDoc(names),
          priority: existing.length,
          createdBy: 'agent',
        }

    const sections = current
      ? [...existing.slice(0, index), written, ...existing.slice(index + 1)]
      : [...existing, written]

    try {
      await saveGuidelines.mutateAsync({ sections })
      // Marked saved in place: the cards stay under their headings, and the
      // offer disappears because it has been taken.
      setPillars(pillars.map((p) => ({ ...p, proposed: false })))
      toast(`Saved ${names.length} content ${names.length === 1 ? 'pillar' : 'pillars'}`)
    } catch (err) {
      onError(err, 'Could not save those pillars')
    }
  }

  return {
    open,
    onOpen: () => setOpen(true),
    panel: {
      now,
      onClose: () => setOpen(false),
      window: planWindow,
      windowChoice,
      onWindowChoiceChange: (choice) => {
        setWindowChoice(choice)
        // The ideas were planned for the old window, so they are no longer an
        // answer to the question on screen.
        reset()
      },
      keyDates: windowKeyDates,
      planned: plannedInWindow(posts, planWindow),
      platforms,
      onPlatformsChange: setPlatforms,
      cadence,
      cadenceSource: inferred.source,
      onCadenceChange: setCadence,
      batch,
      ideas,
      pillars,
      selections,
      onToggleIdea: (index) =>
        setSelections((prev) =>
          prev.map((s, i) => (i === index ? { ...s, rejected: !s.rejected } : s)),
        ),
      onRemovePlatform: (index, platform) =>
        setSelections((prev) =>
          prev.map((s, i) =>
            i === index ? { ...s, platforms: s.platforms.filter((p) => p !== platform) } : s,
          ),
        ),
      outcome,
      onSavePillars: () => void savePillars(),
      savingPillars: saveGuidelines.isPending,
      onRun: () => void run(),
      onReset: reset,
      onCommit: () => void commit(),
      running: themes.isPending,
      writing,
      progress,
    },
  }
}
