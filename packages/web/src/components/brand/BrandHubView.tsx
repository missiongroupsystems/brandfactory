import {
  assetsOfKind,
  type BrandAsset,
  type BrandWithSections,
  type ProjectSummary,
  type ResearchJobSummary,
} from '@brandfactory/shared'
import { BrandContextRail } from '@/components/brand/BrandContextRail'
import { BrandIdentity } from '@/components/brand/BrandIdentity'
import { TILE_APPS, isOrphanThread, type MiniApp } from '@/components/brand/miniApps'
import { MiniAppTile } from '@/components/brand/MiniAppTile'
import { ProjectCard } from '@/components/project/ProjectCard'

// ---------------------------------------------------------------------------
// Brand hub — three zones, answering three questions in reading order
// ---------------------------------------------------------------------------
//
//   who is this?      identity band     — mark, name, TL;DR
//   what can I do?    main column       — the app tiles
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
   * `undefined` = thread counts are not known (still loading, or the query
   * failed). Tiles stay silent rather than claiming zero.
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
   * since Stage 2C (colours) and 2E (the tile count).
   *
   * **One prop rather than two.** 2C passed a pre-filtered `colors`; 2E needs
   * the total as well, for `Visual identity`'s tile. Deriving both from one
   * list keeps a single source and one pending state — passing `colors` and
   * `assets` separately would make "the palette knows but the tile does not" a
   * representable state that means nothing.
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
}: BrandHubViewProps) {
  const countsKnown = projects !== undefined
  // Same rule as the palette: `undefined` is "not known", `[]` is "none".
  const colors = assets && assetsOfKind(assets, 'color')
  // The rail's `Palette` heading links to the surface that owns colours — but
  // only once that surface exists. `Visual identity` is a `Coming soon` stub
  // until 2E flips `enabled`, and the registry is the single place that knows,
  // so the link is derived from it rather than from a second flag. `tiles` is
  // a prop, so the demo's own copy answers for the demo.
  const visualHref = tiles.find((a) => a.id === 'visual')?.enabled
    ? `/brands/${brand.id}/apps/visual`
    : undefined
  // Threads whose templateId matches no registered mini-app would otherwise be
  // reachable from nowhere; surface them under a catch-all below the tiles.
  // `isOrphanThread` consults the full registry, so a hidden-surface thread
  // (brand context) is classified and therefore never lands here.
  const orphanThreads = projects?.filter(isOrphanThread) ?? []

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
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Apps</h2>

            {projectsError && (
              <p className="mb-3 text-sm text-destructive">
                Failed to load threads. Thread counts are unavailable.
              </p>
            )}

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
                  // Each tile counts its own `unit`. `Visual identity` is a
                  // collection of assets, not of threads, so counting threads
                  // there would print `0 threads` on a page that has none to
                  // have — see `MiniApp.unit`.
                  threadCount={
                    app.unit === 'asset'
                      ? (assets?.length ?? null)
                      : countsKnown
                        ? projects.filter(app.match).length
                        : null
                  }
                  href={tileHref?.(app)}
                />
              ))}
            </div>

            {orphanThreads.length > 0 && (
              <div className="mt-8">
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">Other threads</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                  {orphanThreads.map((p) => (
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
              </div>
            )}
          </main>

          <BrandContextRail
            brand={brand}
            onEdit={onEdit}
            // **The stacked rail is one tile column wide, not the whole page.**
            // Below `lg` the two columns stack and the rail was taking the full
            // ~830px, which turned every section row into a stretched hit area
            // with its chevron at the far end and put `Edit` back across the
            // page — precisely the 1.4.0 `BrandContextBar` shape this component
            // was written to replace (see its doc comment). 1.7.0 logged it,
            // 1.8.0 measured it, 2C narrowed it to the section list; this caps
            // it. `calc(50% - 0.375rem)` is one column of the `sm:grid-cols-2
            // gap-3` tile grid above, so the card's right edge lands on the
            // grid's. Below `sm` the tiles are one column and so is this.
            className="sm:max-w-[calc(50%-0.375rem)] lg:w-80 lg:max-w-none lg:shrink-0"
            colors={colors}
            paletteHref={visualHref}
            research={research}
            onStartResearch={onStartResearch}
            onReviewDrafts={onReviewDrafts}
          />
        </div>
      </div>
    </div>
  )
}
