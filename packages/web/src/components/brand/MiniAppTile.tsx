import { Link } from '@tanstack/react-router'
import type { MiniApp } from '@/components/brand/miniApps'
import { cn } from '@/lib/utils'

const TILE_CLASS =
  'group relative flex flex-col rounded-xl border bg-card p-4 shadow-elevation-1 transition-colors duration-150'

export interface MiniAppTileProps {
  app: MiniApp
  brandId: string
  /** `null` = not loaded yet / failed; the tile stays silent rather than claiming zero. */
  threadCount: number | null
}

// One entry from the MINI_APPS registry, as rendered on the brand hub. Enabled
// tiles are real links (cmd/middle-click open a mini-app in a new tab, same
// reasoning as ProjectCard); disabled ones are inert divs carrying a "Soon"
// pill.
//
// The "Soon" state is signalled by the pill alone — no blanket `opacity`, which
// would drag the description text below WCAG AA (measured 2.9:1 light / 3.8:1
// dark at 60%). The pill and muted title carry the meaning at full contrast.
export function MiniAppTile({ app, brandId, threadCount }: MiniAppTileProps) {
  const Icon = app.icon
  // A "Soon" tile that also reads "0 threads" is noise — but if threads somehow
  // exist under a not-yet-live template, the count still shows.
  const showCount = threadCount !== null && (app.enabled || threadCount > 0)
  // ...and a tile that advertises threads has to be able to reach them, or the
  // count points at data with no route to it. A Soon tile holding threads links
  // through to a page that lists them without offering to create more.
  const linkable = app.enabled || (threadCount !== null && threadCount > 0)

  const body = (
    <>
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate font-medium">{app.title}</span>
        {/* Sentence case, 12px/500, neutral beige (§0.4, §12.4). The only
            uppercase text the CI allows is a side-nav section eyebrow, and
            this app has no side nav — so nothing here is ever caps. */}
        {!app.enabled && (
          <span className="ml-auto rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Soon
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{app.description}</p>
      <span className="mt-3 text-xs text-muted-foreground">
        {showCount ? (threadCount === 1 ? '1 thread' : `${threadCount} threads`) : ' '}
      </span>
    </>
  )

  if (!linkable) {
    return (
      <div className={cn(TILE_CLASS)} aria-disabled="true">
        {body}
      </div>
    )
  }

  return (
    <Link
      to="/brands/$brandId/apps/$appId"
      params={{ brandId, appId: app.id }}
      className={cn(TILE_CLASS, 'hover:bg-accent')}
    >
      {body}
    </Link>
  )
}
