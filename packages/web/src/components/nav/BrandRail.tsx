import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { useWorkspaceBrands } from '@/api/queries/workspaces'
import { useActiveBrandId } from '@/lib/active-brand'
import { BrandMark } from '@/components/brand/BrandMark'
import { NewBrandDialog } from '@/components/NewBrandDialog'
import { ThemeToggle } from '@/components/ThemeToggle'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// BrandRail — every brand in the workspace, one click from anywhere
// ---------------------------------------------------------------------------
//
// 56px of monograms against the left edge, under the workspace tile.
//
// **Why the brands and not something else.** `docs/vision.md` opens on the
// brand being the centre of gravity — every creative surface is *in the orbit
// of one*, and switching between them is the motion this product makes most
// often. 1.6.0 put a switcher in the header for exactly that reason and 1.12.0
// added create to it; both were menus, which means every switch costs an open,
// a read and a click. A rail costs one click, and it costs it from a project
// thread just as cheaply as from the hub.
//
// It also gives `BrandMark` the job it was designed for. The hue is derived
// from the brand **id**, so it survives a rename (see `brandHue`) — a column of
// marks is stable enough to navigate by muscle memory, which is the only reason
// a 56px strip of two-letter squares beats a list of names.
//
// **The marks are recognition; the panel header is recall.** See
// `BrandSwitcher` — a rail cannot hold 30 legible names, and a dropdown cannot
// be hit without being opened first.

export interface BrandRailProps {
  /** The workspace whose brands the rail lists. `null` = none resolved yet. */
  workspaceId: string | null
  /** Is the contextual panel folded away? Drives the toggle's icon and label. */
  panelCollapsed: boolean
  onTogglePanel: () => void
}

export function BrandRail({ workspaceId, panelCollapsed, onTogglePanel }: BrandRailProps) {
  const { data: brands } = useWorkspaceBrands(workspaceId ?? '')
  const activeBrandId = useActiveBrandId()
  const [newOpen, setNewOpen] = useState(false)

  const PanelIcon = panelCollapsed ? PanelLeftOpen : PanelLeftClose
  const panelLabel = panelCollapsed ? 'Show navigation panel' : 'Hide navigation panel'

  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r bg-card py-3">
      <WorkspaceSwitcher />

      <div className="h-px w-6 shrink-0 bg-border" />

      {/* The list scrolls; the tiles above and the controls below do not. A
          workspace with 40 brands must not push the theme toggle off the
          bottom of the viewport, and `min-h-0` is what lets this column
          actually shrink inside the flex parent rather than overflowing it.
          `w-full` and the padding are the selected tile's ring: `overflow-y`
          set to anything but `visible` computes `overflow-x` to `auto`, so this
          box clips horizontally whether or not it was asked to. Left to size to
          its content it is exactly one 36px tile wide, and the ring — 2px of
          offset and 2px of ring, on all four sides — was being sliced flat
          against both edges. The box is the full 56px of the rail now, and the
          padding is ≥4px on every side so the first and last tiles keep their
          ring at the scroll boundaries too. */}
      <div className="flex w-full min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto px-1 py-1.5">
        {(brands ?? []).map((b) => {
          const active = b.id === activeBrandId
          return (
            <Link
              key={b.id}
              to="/brands/$brandId"
              params={{ brandId: b.id }}
              // The mark itself is `aria-hidden` — it is a restatement of the
              // name — so the link carries the name as text for AT, and the
              // pointer gets it as a native tooltip. Neither is decoration:
              // without them the rail is 40 unlabelled squares.
              title={b.name}
              className={cn(
                'rounded-[10px] transition-opacity duration-150',
                // Accent on the *selected* state is one of the four things §4
                // allows it to be spent on, and a ring is what a tile whose fill
                // is already the customer's own colour can wear without
                // overwriting it.
                active
                  ? 'ring-2 ring-[var(--color-brand-accent)] ring-offset-2 ring-offset-card'
                  : 'hover:opacity-80',
              )}
            >
              <BrandMark name={b.name} seed={b.id} size="sm" className="size-9 rounded-[10px]" />
              <span className="sr-only">{b.name}</span>
            </Link>
          )
        })}

        {/* Create lives at the foot of the list it adds to, which is where the
            eye already is after reading it — and it is the third entry point,
            after workspace home and the brand menu. `disabled` without a
            workspace for the reason `BrandSwitcher`'s item is: no workspace,
            no POST target. */}
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground"
          aria-label="New brand"
          title="New brand"
          disabled={!workspaceId}
          onClick={() => setNewOpen(true)}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        {/* Desktop-only: below `lg` the whole sidebar is a drawer that is
            dismissed rather than folded, so a fold control there would be a
            second, contradictory way to make navigation disappear. */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 text-muted-foreground lg:inline-flex"
          aria-label={panelLabel}
          title={panelLabel}
          aria-pressed={panelCollapsed}
          onClick={onTogglePanel}
        >
          <PanelIcon className="size-4" />
        </Button>
        <ThemeToggle />
      </div>

      {workspaceId ? (
        <NewBrandDialog wsId={workspaceId} open={newOpen} onOpenChange={setNewOpen} />
      ) : null}
    </div>
  )
}
