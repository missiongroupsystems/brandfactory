import { useId, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '@/auth/store'
import { useWorkspaces } from '@/api/queries/workspaces'
import { useActiveWorkspaceId } from '@/lib/workspace-context'
import { setLastWorkspaceId } from '@/lib/last-workspace'
import { NewWorkspaceDialog } from '@/components/NewWorkspaceDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The workspace tile at the head of the rail — styleguide §7.2's first item,
 * *"square accent logo tile (~10px radius), workspace name"*, at rail width.
 *
 * **It is a tile rather than the 1.6.0 pill because of where it now lives.** The
 * pill sat in a 12px-tall header strip beside a second pill and a breadcrumb
 * tail; the rail is 56 pixels wide and holds the brand monograms, so the one
 * thing above them has to read as *the container they are in* at a glance and
 * from the corner of an eye. The name comes back as the menu's own label, which
 * is where a 40-character workspace name can actually be read.
 *
 * **The accessible name is still the workspace**, exactly as before: the visible
 * initial is one glyph, so the name is carried in an `sr-only` span rather than
 * an `aria-label`, which would have replaced it with "Switch workspace" and hidden
 * *which* workspace is active from assistive tech — the defect the pill's own
 * comment was written to prevent.
 */
export function WorkspaceSwitcher() {
  const token = useAuthStore((s) => s.token)
  const { data: workspaces } = useWorkspaces({ enabled: !!token })
  const activeId = useActiveWorkspaceId()
  const navigate = useNavigate()
  const [newOpen, setNewOpen] = useState(false)
  const hintId = useId()

  if (!token || !workspaces?.length) return null

  const current = workspaces.find((w) => w.id === activeId)
  const label = current?.name ?? 'Select workspace'
  // One glyph, by code point: `[...name][0]` rather than `name[0]`, or a name
  // beginning with an emoji renders half a surrogate pair. Same rule as
  // `brandInitials`, and the same reason.
  const initial = ([...label.trim()][0] ?? '?').toUpperCase()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            // `aria-describedby` at a sibling, not `aria-description`: the
            // latter is an ARIA 1.3 draft attribute that neither the linter nor
            // half the screen readers accept on a `button`. The target sits
            // *outside* the button because a descendant would be folded into
            // the accessible name as well, and the name has to stay the
            // workspace.
            aria-describedby={hintId}
            className="flex size-9 items-center justify-center rounded-[10px] bg-surface-accent text-sm font-medium text-[var(--color-text-inverse)] transition-opacity duration-150 hover:opacity-90"
          >
            <span aria-hidden="true">{initial}</span>
            <span className="sr-only">{label}</span>
          </button>
        </DropdownMenuTrigger>
        {/* `side="right"`, because the trigger is now against the left edge of
            the viewport — a menu aligned under it would open off-screen at the
            left and clipped at the top. Capped for the reason `BrandSwitcher`'s
            is: a dropdown with no maximum grows to its widest child, so the
            `truncate` on each row never engages. */}
        <DropdownMenuContent side="right" align="start" className="min-w-56 max-w-80">
          {/* The name the tile can no longer show. A label rather than a
              disabled item: it is not a destination and must not take focus. */}
          <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* Radio semantics, not plain items: the check mark is opacity-only,
              so without `aria-checked` the active workspace is signalled
              visually and nowhere else. */}
          <DropdownMenuRadioGroup value={activeId ?? ''}>
            {workspaces.map((ws) => (
              <DropdownMenuRadioItem
                key={ws.id}
                value={ws.id}
                onSelect={() => {
                  setLastWorkspaceId(ws.id)
                  void navigate({ to: '/workspaces/$wsId', params: { wsId: ws.id } })
                }}
              >
                <span className="min-w-0 truncate">{ws.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              // Deferred for the same reason as EntityMenu: opening the dialog
              // in this tick leaves the menu's focus scope fighting the
              // dialog's. See `deferUntilMenuClosed`.
              setTimeout(() => setNewOpen(true), 0)
            }}
          >
            New workspace…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!activeId}
            onSelect={() => {
              if (!activeId) return
              void navigate({
                to: '/workspaces/$wsId/settings',
                params: { wsId: activeId },
              })
            }}
          >
            Workspace settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span id={hintId} className="sr-only">
        Switch workspace
      </span>
      <NewWorkspaceDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  )
}
