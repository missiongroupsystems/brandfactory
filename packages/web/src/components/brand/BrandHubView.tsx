import type { BrandWithSections, ProjectSummary } from '@brandfactory/shared'
import { BrandContextRail, type RailVariant } from '@/components/brand/BrandContextRail'
import { BrandIdentity } from '@/components/brand/BrandIdentity'
import { TILE_APPS, isOrphanThread, type MiniApp } from '@/components/brand/miniApps'
import { MiniAppTile } from '@/components/brand/MiniAppTile'
import { ProjectCard } from '@/components/project/ProjectCard'
import type { BrandAsset } from '@/demo/assetTypes'
import type { ResearchJobSummary } from '@/demo/researchTypes'

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
// `routes/brands.$brandId.tsx` owns every query, every mutation and all three
// dialogs, and feeds this component props. `routes/demo.brand.tsx` feeds the
// same component fixtures. Both render inside the real router, the real app
// shell, the real `index.css` and the real theme toggle — which is the list
// 1.7.0's throwaway Vite harness could not put in a screenshot.
//
// **The invariant that keeps the real hub unchanged.** Every prop below the
// `onEdit` line is added by the front-end mockup pass, and:
//
//   the real route can only pass null / empty for each of them, and every
//   affordance they drive renders *nothing* when its prop is absent.
//
// That holds by construction today — `Brand` has no `website_url`, there is no
// assets query and no research query, so the route has nothing to pass even if
// it wanted to. It stops holding the moment the backend passes land those
// queries, which is why it is written here rather than relied on.

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

  // ---- absent on the real route; see the invariant above --------------------

  /**
   * The tile registry, as a prop. The real route passes nothing and gets
   * `TILE_APPS`. The demo passes a copy with `Visual identity` enabled, so
   * `miniApps.ts` is never edited — flipping `enabled` there would turn a dead
   * tile on for every real brand, which is the affordance 1.7.0 was cleaning up.
   */
  tiles?: MiniApp[]
  /** Per-tile destination override. See `MiniAppTile`'s `href`. */
  tileHref?: (app: MiniApp) => string | undefined
  websiteUrl?: string | null
  /** Resolved URL for a `role: 'logo'` asset. Falls back to the monogram. */
  logoSrc?: string | null
  /** Inline colour assets, `proposed` ones included. */
  colors?: BrandAsset[]
  railVariant?: RailVariant
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
  colors,
  railVariant = 'C',
  research,
  onStartResearch,
  onReviewDrafts,
}: BrandHubViewProps) {
  const countsKnown = projects !== undefined
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
          // Structure B, and only B: the palette sits under the mark, leaving
          // the rail's one-list rule untouched.
          colors={railVariant === 'B' ? colors : undefined}
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
                  threadCount={countsKnown ? projects.filter(app.match).length : null}
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
            className="lg:w-80 lg:shrink-0"
            // Structure A, and only A: the palette becomes a rail block.
            colors={railVariant === 'A' ? colors : undefined}
            research={research}
            onStartResearch={onStartResearch}
            onReviewDrafts={onReviewDrafts}
          />
        </div>
      </div>
    </div>
  )
}
