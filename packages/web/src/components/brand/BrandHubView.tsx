import {
  type BrandAsset,
  type BrandWithSections,
  type ProjectSummary,
  type ResearchJobSummary,
} from '@brandfactory/shared'
import { BrandContextRail } from '@/components/brand/BrandContextRail'
import { BrandIdentity } from '@/components/brand/BrandIdentity'
import { VisualIdentityCard } from '@/components/brand/VisualIdentityCard'
import { TILE_APPS, isBrandContextThread, type MiniApp } from '@/components/brand/miniApps'
import { MiniAppTile } from '@/components/brand/MiniAppTile'
import { ProjectCard } from '@/components/project/ProjectCard'

/**
 * How many threads the hub resumes from. Four is two rows of the `minmax(220px)`
 * grid at hub width — enough to recognise the one you want, short enough that
 * the rail stays beside the section rather than above a scroll of cards.
 */
const RECENT_THREADS = 4

// ---------------------------------------------------------------------------
// Brand hub — three zones, answering three questions in reading order
// ---------------------------------------------------------------------------
//
//   who is this?      identity band     — mark, name, TL;DR
//   what can I do?    main column       — start something, then resume something
//   what do we know?  right rail        — brand context, always on screen
//
// The two lower zones are columns rather than bands because the rail's job is
// to be *available while you choose*, not to be read and scrolled past. Below
// `lg` they stack, and the apps come first: on a narrow screen the reason you
// opened this page is the thing you should reach without scrolling.
//
// This is the first route in the app to constrain its width. Every other
// surface is `flex-1 overflow-auto p-6`, which at 2000px leaves a title at one
// edge and its ⋯ menu at the other with nothing between them. The container
// lives here rather than in the shell because widening the *other* routes is a
// change to pages this pass has no business touching.
//
// ---------------------------------------------------------------------------
// What the side-nav took, and what it gave back
// ---------------------------------------------------------------------------
//
// The tile grid was this page's *navigation*, and it no longer has to be: the
// panel two columns left lists the same five categories on every page of the
// brand, lit on the one you are in, with each category's threads nested under
// it. So the hub keeps the half a nav row cannot do and gives up the half it
// duplicates:
//
//   kept       a sentence saying what a category is for, and a way to start one
//   given up   the per-tile thread count — the same number, 200px away, now
//              permanently on screen in the nav (`BrandNavPanel`)
//   given up   the `Other threads` catch-all, which was a list of *threads*
//              filed by what they are not; the panel carries it as a group,
//              where it sits beside the categories it is defined against
//   gained     `Recent threads` — the brand's last few, newest first, across
//              every category. The counts said how much there was; this says
//              what you were last doing, which is the question someone opening
//              a brand at 9am is actually asking.
//
// ---------------------------------------------------------------------------
// Why this is a view and not a page
// ---------------------------------------------------------------------------
//
// `routes/brands.$brandId.tsx` owns every query, every mutation and all four
// dialogs, and feeds this component props. Until 3G a mockup route fed the same
// component fixtures, which is why the split exists at all: the mockup rendered
// the *route's own* component inside the real router, the real app shell, the
// real `index.css` and the real theme toggle — the list 1.7.0's throwaway Vite
// harness could not put in a screenshot.
//
// **The invariant that kept the real hub unchanged, and how it ended.** Every
// prop below the `onEdit` line was added by the front-end mockup pass under two
// promises:
//
//   the real route can only pass null / empty for each of them, and every
//   affordance they drive renders *nothing* when its prop is absent.
//
// **The first half is now fully retired, on purpose and one stage at a time** —
// `websiteUrl` (1A), `assets` (2C, 2E), `logoSrc` (2D), `research` and
// `onStartResearch` (3C), `onReviewDrafts` (3E). There is no unfed prop left, and
// the mockup that justified them is deleted.
//
// **The second half is what carries the weight from here, and it is unchanged:**
//
//   every affordance still renders nothing when its prop is absent — and
//   "absent" is now a real runtime state, because a query can be pending,
//   empty, or failed, and a deployment can have no research provider at all.
//
// A brand with no website renders no link; a brand with no colours renders no
// palette block; a deployment with `RESEARCH_PROVIDER=none` renders no research
// row. None is a placeholder saying so, and all three are byte-identical to
// 1.7.0. `tiles` and `tileHref` remain props because the tests drive them.
//
// **`railVariant` is gone.** 1.8.0 built the palette three ways so two could be
// deleted; the screenshots settled it and the rail block is the survivor. A prop
// with one legal value is a prop that has already been decided.

export interface BrandHubViewProps {
  brand: BrandWithSections
  /**
   * The brand's threads.
   *
   * `undefined` = not known (still loading, or the query failed), and it is not
   * `[]`: `Recent threads` stays silent rather than telling a brand with forty
   * of them that it has none, and `hasBrandContextThreads` reads the same
   * distinction to decide whether to claim a missing report copy.
   *
   * It no longer feeds the tiles — the counts moved to the nav; see the note at
   * the top of this file.
   */
  projects?: ProjectSummary[]
  projectsError?: boolean
  onRename: () => void
  onDelete: () => void
  onEdit: () => void
  /**
   * `brand.websiteUrl`. Fed by the real route since Stage 1A; renders nothing
   * when null, which is the surviving half of the invariant above.
   */
  websiteUrl?: string | null
  /**
   * The brand's assets — all kinds, `proposed` included. Fed by the real route
   * since Stage 2C.
   *
   * 2E widened it from a pre-filtered `colors` to the whole list because
   * `Visual identity`'s tile counted assets; that count is the nav's now, and
   * the whole list stays anyway — the palette is derived from it, and narrowing
   * the prop back would be churn for one `filter` moved across a file boundary.
   *
   * `undefined` = not known (pending or failed), `[]` = the brand has none.
   * Neither renders a palette block — see `BrandContextRailProps`.
   */
  assets?: BrandAsset[]

  // ---- still absent on the real route; see the invariant above --------------

  /**
   * The tile registry, as a prop. The real route passes nothing and gets
   * `TILE_APPS`. The demo passes a copy with `Visual identity` enabled, so
   * `miniApps.ts` is never edited — flipping `enabled` there would turn a dead
   * tile on for every real brand, which is the affordance 1.7.0 was cleaning up.
   */
  tiles?: MiniApp[]
  /** Per-tile destination override. See `MiniAppTile`'s `href`. */
  tileHref?: (app: MiniApp) => string | undefined
  /** Resolved URL for a `role: 'logo'` asset. Falls back to the monogram. */
  logoSrc?: string | null
  research?: ResearchJobSummary | null
  onStartResearch?: () => void
  onReviewDrafts?: () => void
  /** Opens the report dialog — see `BrandContextRailProps.onReadReport`. */
  onReadReport?: () => void
  /**
   * A start request is in flight. Disables the row, because until the POST
   * resolves nothing in the cache has changed and the row still invites a second
   * click — which used to buy a second paid run.
   */
  researchStarting?: boolean
  /** `RESEARCH_JOB_MAX_MINUTES` — see `BrandContextRailProps.researchMaxMinutes`. */
  researchMaxMinutes?: number
  /** The status poll is failing — see `BrandContextRailProps.researchUnreachable`. */
  researchUnreachable?: boolean
}

export function BrandHubView({
  brand,
  projects,
  projectsError = false,
  onRename,
  onDelete,
  onEdit,
  tiles = TILE_APPS,
  tileHref,
  websiteUrl,
  logoSrc,
  assets,
  research,
  onStartResearch,
  onReviewDrafts,
  onReadReport,
  researchStarting = false,
  researchMaxMinutes,
  researchUnreachable = false,
}: BrandHubViewProps) {
  // **`colors` and `visualHref` are gone with the palette block they fed.** The
  // hub derived both to hand down to `BrandContextRail`; `VisualIdentityCard`
  // takes the whole `assets` list and derives its own, which is the same work in
  // the component that owns the question. This view no longer knows what a
  // colour is.
  //
  // The brand's last few threads, newest first — every category, including the
  // ones no category claims. `RECENT_THREADS` rather than the whole list: this
  // is a resume affordance, not an index, and the index is the nav.
  //
  // Sorted on a copy. `projects` is React Query's cached array and an in-place
  // sort would mutate it, which is invisible until something else reads the
  // same key expecting the server's order.
  const recentThreads = [...(projects ?? [])]
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, RECENT_THREADS)
  // Derived here rather than passed as a second prop, for the reason the palette
  // is: two props would make "the rail thinks the report landed but the tiles
  // disagree" representable. `undefined` while the list is unknown — the rail
  // reads that as "keep the promise", see `hasBrandContextThreads`, which now
  // decides one sentence rather than whether the report is reachable at all.
  const hasBrandContextThreads = projects && projects.some(isBrandContextThread)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl p-6 lg:p-8">
        <BrandIdentity
          brand={brand}
          onRename={onRename}
          onDelete={onDelete}
          websiteUrl={websiteUrl}
          logoSrc={logoSrc}
        />

        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <main className="min-w-0 flex-1">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Start something</h2>

            {/* A fixed 2-up, not `auto-fill`: four tiles into a column this
                wide fits three across and drops the fourth onto a row of
                its own beside a tile-and-a-half of dead space. A 2×2 block
                also squares up against the rail instead of out-running it. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tiles.map((app) => (
                <MiniAppTile
                  key={app.id}
                  app={app}
                  brandId={brand.id}
                  // **`null` on every tile, on purpose** — see the note at the
                  // top of this file. The count lives in the nav row for the
                  // same category, which is on screen right now and stays there
                  // on every other page of the brand. `null` is already this
                  // component's "not known, say nothing" value, so nothing in
                  // `MiniAppTile` had to change to stop counting.
                  threadCount={null}
                  href={tileHref?.(app)}
                />
              ))}
            </div>

            <div className="mt-8">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent threads</h2>

              {projectsError && (
                <p className="text-sm text-destructive">
                  Failed to load this brand&apos;s threads.
                </p>
              )}

              {!projectsError && recentThreads.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {recentThreads.map((p) => (
                    <ProjectCard
                      key={p.id}
                      id={p.id}
                      name={p.name}
                      kind={p.kind}
                      brandId={brand.id}
                      workspaceId={brand.workspaceId}
                      lastActivityAt={p.lastActivityAt}
                      showBrandName={false}
                    />
                  ))}
                </div>
              )}

              {/* Only once the list is *known* to be empty. While `projects` is
                  undefined the section says nothing at all, rather than telling
                  a brand with forty threads that it has none for the 100ms
                  before the query lands. */}
              {!projectsError && projects !== undefined && recentThreads.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing yet. Every thread you start above shows up here, newest first.
                </p>
              )}
            </div>
          </main>

          {/* **The right column holds two cards now, and the width moved to the
            column.** It was on the rail, which was the only thing in it; a
            second card had to inherit the same measure or the two would step on
            each other at every breakpoint. Same values, one level up.

            **The stacked column is one tile column wide, not the whole page.**
            Below `lg` the two columns stack and the rail was taking the full
            ~830px, which turned every section row into a stretched hit area
            with its chevron at the far end and put `Edit` back across the
            page — precisely the 1.4.0 `BrandContextBar` shape this component
            was written to replace (see its doc comment). 1.7.0 logged it,
            1.8.0 measured it, 2C narrowed it to the section list; this caps
            it. `calc(50% - 0.375rem)` is one column of the `sm:grid-cols-2
            gap-3` tile grid above, so the card's right edge lands on the
            grid's. Below `sm` the tiles are one column and so is this. */}
          <aside className="flex flex-col gap-3 sm:max-w-[calc(50%-0.375rem)] lg:w-80 lg:max-w-none lg:shrink-0">
            <BrandContextRail
              brand={brand}
              onEdit={onEdit}
              research={research}
              onStartResearch={onStartResearch}
              onReviewDrafts={onReviewDrafts}
              onReadReport={onReadReport}
              researchStarting={researchStarting}
              researchMaxMinutes={researchMaxMinutes}
              researchUnreachable={researchUnreachable}
              hasBrandContextThreads={hasBrandContextThreads}
            />

            {/* Renders nothing at all for a brand with no mark, no colours and no
              typefaces, so the column is one card again on a brand that has not
              started — which is the state the palette block was already silent
              in, now applied to the whole card. */}
            <VisualIdentityCard brand={brand} assets={assets} logoSrc={logoSrc} />
          </aside>
        </div>
      </div>
    </div>
  )
}
