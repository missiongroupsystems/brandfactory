import { useLocation } from '@tanstack/react-router'
import { LayoutGrid } from 'lucide-react'
import type { ProjectSummary } from '@brandfactory/shared'
import { useBrandAssets } from '@/api/queries/assets'
import { useBrandSocialPosts } from '@/api/queries/social-posts'
import { useBrandProjects } from '@/api/queries/brands'
import { BrandSwitcher } from '@/components/BrandSwitcher'
import { assetsOfLibrary } from '@brandfactory/shared'
import {
  BRAND_CONTEXT_TEMPLATE_ID,
  isBrandContextThread,
  isOrphanThread,
  LIBRARY_APPS,
  miniAppById,
  TILE_APPS,
  type MiniApp,
} from '@/components/brand/miniApps'
import { NavGroup, NavItem } from '@/components/nav/NavPrimitives'
import { ResearchInFlightIndicator } from '@/components/ResearchInFlightIndicator'
import { brandNavKey, projectNavId } from '@/lib/nav-active'

// ---------------------------------------------------------------------------
// BrandNavPanel — the second column, while you are inside a brand
// ---------------------------------------------------------------------------
//
// The registry is the nav. `TILE_APPS` already knows the app list, which ids are
// live, what each one counts and which threads belong to it — every fact this
// panel needs — so the rows are derived from it rather than restated here. A
// second hand-written list is how a mini-app ends up reachable from a tile and
// invisible in the nav, or the reverse.
//
// **The counts moved here from the hub tiles, and did not get copied.** A number
// wants to be where the choice is made: the nav is on screen on every page of
// the brand, the tiles are on one of them. The tiles keep the job the nav cannot
// do — *starting* something, with a sentence saying what it is for.
//
// **Threads nest under their category once you are in it.** This is the payoff
// of a sidebar over a header, and it is the one place the panel is more than a
// list of pages: a project route carries no brand and no category in its path
// (`/projects/:id`), so before the sidebar, moving between two copywriting
// threads meant going up to the category page and back down. The category you
// are working in expands; the others stay one line each.

const MAX_NESTED_THREADS = 8

export function BrandNavPanel({ brandId }: { brandId: string }) {
  const pathname = useLocation({ select: (l) => l.pathname })
  const { data: projects } = useBrandProjects(brandId)
  // The two queries this panel adds to a page that would not otherwise make
  // them — and only on the routes that are not the library or the calendar,
  // both of which ask for the same keys. `Visual identity` counts assets and
  // `Social calendar` counts posts, not threads (`MiniApp.unit`), and a nav
  // row that could count but doesn't is the silent half-answer the hub tiles
  // used to give.
  const { data: assets } = useBrandAssets(brandId)
  const { data: socialPosts } = useBrandSocialPosts(brandId)

  const activeKey = brandNavKey(pathname, brandId)
  const openProjectId = projectNavId(pathname)
  const openProject = openProjectId ? projects?.find((p) => p.id === openProjectId) : undefined

  const contextApp = miniAppById('context')

  /** The threads of one category, newest first — see `MAX_NESTED_THREADS`. */
  function threadsOf(match: (p: ProjectSummary) => boolean): ProjectSummary[] {
    return (projects ?? [])
      .filter(match)
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
      .slice(0, MAX_NESTED_THREADS)
  }

  /**
   * Is this the category on screen? Either its own page is open, or the project
   * that is open belongs to it — which is what makes a thread's siblings
   * reachable from inside it.
   */
  function isCurrent(app: MiniApp): boolean {
    if (activeKey === `app:${app.id}`) return true
    return openProject ? app.match(openProject) : false
  }

  function countOf(app: MiniApp): number | null {
    // **The library case comes first, and the order is the whole of it.** All
    // three shelves are `unit: 'asset'` (one storage concept, one word), so the
    // arm below would answer every one of them with the brand's *total* asset
    // count — three identical numbers, none of them the shelf you are looking
    // at.
    if (app.library) return assets ? assetsOfLibrary(assets, app.library).length : null
    // One surface, not a collection — there is nothing to count. `null` is the
    // existing "not known, say nothing" value, so the row renders no number
    // rather than a `0` that would read as "empty". See `MiniApp.unit`.
    if (app.unit === 'canvas') return null
    if (app.unit === 'asset') return assets?.length ?? null
    if (app.unit === 'post') return socialPosts?.length ?? null
    return projects ? projects.filter(app.match).length : null
  }

  const contextCurrent =
    activeKey === 'context' || (openProject ? isBrandContextThread(openProject) : false)
  // Same catch-all the hub renders, for the same reason: a thread whose
  // templateId matches no registered app is reachable from nowhere otherwise.
  // Absent — not empty — when there are none, so a healthy brand carries no
  // heading for a category it does not have.
  const orphans = threadsOf(isOrphanThread)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* `h-16` on both panel headers, so the border under them lands on the
          same line no matter which scope the shell is in — a divider that jumps
          by four pixels when you enter a brand is a page that looks like it
          reloaded into a different app. */}
      <header className="flex h-16 shrink-0 items-center border-b px-2">
        <BrandSwitcher />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <NavGroup>
          <NavItem
            link={{ to: '/brands/$brandId', params: { brandId } }}
            label="Overview"
            icon={LayoutGrid}
            active={activeKey === 'overview'}
          />
        </NavGroup>

        <NavGroup label="Apps">
          {TILE_APPS.map((app) => {
            const current = isCurrent(app)
            return (
              <div key={app.id} className="flex flex-col gap-0.5">
                <NavItem
                  link={{
                    to: '/brands/$brandId/apps/$appId',
                    params: { brandId, appId: app.id },
                  }}
                  label={app.title}
                  icon={app.icon}
                  active={activeKey === `app:${app.id}`}
                  childActive={openProject ? app.match(openProject) : false}
                  // A not-yet-live app says `Soon` instead of a number: `0
                  // threads` on a page that has none to have is false rather
                  // than merely unhelpful (`MiniApp.unit`), and the pill is the
                  // fact worth the space.
                  badge={app.enabled ? undefined : 'Soon'}
                  count={app.enabled ? countOf(app) : undefined}
                />
                {/* Threads only — an asset library has none, and nesting
                    twelve colours under a nav row would be a second, worse
                    Visual identity page. */}
                {current && app.unit === 'thread'
                  ? threadsOf(app.match).map((p) => (
                      <NavItem
                        key={p.id}
                        link={{ to: '/projects/$projectId', params: { projectId: p.id } }}
                        label={p.name}
                        depth={1}
                        active={p.id === openProjectId}
                      />
                    ))
                  : null}
              </div>
            )
          })}
        </NavGroup>

        {/* **Singular.** It is one library with three shelves, not three
            libraries — which is what lets the group later grow a fourth row
            that is somebody else's drive without the label becoming a lie.
            (That row is not built: it exists only once there is something
            behind it.)

            No nested children, unlike the Apps group. A shelf has no threads,
            and nesting twelve colours under a nav row would be a second, worse
            Visual identity page. */}
        <NavGroup label="Library">
          {LIBRARY_APPS.map((app) => (
            <NavItem
              key={app.id}
              link={app.to(brandId)}
              label={app.title}
              icon={app.icon}
              active={activeKey === `library:${app.library}`}
              count={countOf(app)}
            />
          ))}
        </NavGroup>

        <NavGroup label="Brand">
          {contextApp && (
            <>
              {/* The literal, not `contextApp.to(brandId)`. `miniAppById`
                  returns the whole union, where `to` is absent on tile rows —
                  so reading it here needs a `?.` and a fallback literal, which
                  is two spellings of one path where there was one. The library
                  rows above come off `LIBRARY_APPS`, which is narrowed. */}
              <NavItem
                link={{ to: '/brands/$brandId/context', params: { brandId } }}
                label={contextApp.title}
                icon={contextApp.icon}
                active={activeKey === 'context'}
                childActive={openProject ? isBrandContextThread(openProject) : false}
                count={projects ? projects.filter(isBrandContextThread).length : null}
              />
              {contextCurrent
                ? threadsOf(
                    (p) => p.kind === 'standardized' && p.templateId === BRAND_CONTEXT_TEMPLATE_ID,
                  ).map((p) => (
                    <NavItem
                      key={p.id}
                      link={{ to: '/projects/$projectId', params: { projectId: p.id } }}
                      label={p.name}
                      depth={1}
                      active={p.id === openProjectId}
                    />
                  ))
                : null}
            </>
          )}
        </NavGroup>

        {orphans.length > 0 && (
          <NavGroup label="Other threads">
            {orphans.map((p) => (
              <NavItem
                key={p.id}
                link={{ to: '/projects/$projectId', params: { projectId: p.id } }}
                label={p.name}
                active={p.id === openProjectId}
              />
            ))}
          </NavGroup>
        )}
      </div>

      {/* **The research chip's new home, and a better one than the header.** It
          renders only while a run is `IN_PROGRESS` (see its own note), so the
          footer is empty on almost every page — but when it is not, it is beside
          the brand the run belongs to rather than in a strip shared with every
          other brand's chrome. Terminal states stay on the hub's rail, which is
          where the actions for them are. */}
      <div className="shrink-0 border-t p-2 empty:hidden">
        <ResearchInFlightIndicator />
      </div>
    </div>
  )
}
