import { useId, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown } from 'lucide-react'
import { useAuthStore } from '@/auth/store'
import { useBrand } from '@/api/queries/brands'
import { useWorkspaceBrands } from '@/api/queries/workspaces'
import { useActiveBrandId } from '@/lib/active-brand'
import { useActiveWorkspaceId } from '@/lib/workspace-context'
import { BrandMark } from '@/components/brand/BrandMark'
import { NewBrandDialog } from '@/components/NewBrandDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The **header of the brand panel** — the brand you are inside, and the way to
 * any other one by name. Present only while the shell is in a brand (a hub, a
 * mini-app page, a conversation list, a project), and absent everywhere else.
 *
 * **It was a pill in the header strip until the sidebar landed.** The move is
 * not decoration: a panel header is a full row, so the name gets ~200px instead
 * of a 56px `max-w` before the ellipsis, and the mark beside it is the same
 * monogram the rail draws — which is what ties "the coloured square I clicked"
 * to "the brand I am now in" instead of leaving the user to infer it.
 *
 * **Two ways to switch brands, and they are different gestures.** The rail is
 * recognition — one click to a mark you know, from any page, no menu. This is
 * recall — the full list by name, capped and scrolling, with create and the way
 * out attached. The rail cannot hold 30 legible names and a dropdown cannot be
 * hit without opening; a workspace of sibling brands wants both.
 */
export function BrandSwitcher() {
  const token = useAuthStore((s) => s.token)
  const workspaceId = useActiveWorkspaceId()
  const brandId = useActiveBrandId()
  const { data: brands } = useWorkspaceBrands(workspaceId ?? '')
  // Fallback name source. The brand detail is already cached by the page
  // itself, so a deep link into a project renders the right name immediately
  // instead of waiting on the workspace-wide list.
  const { data: brand } = useBrand(brandId ?? '')
  const navigate = useNavigate()
  const [newOpen, setNewOpen] = useState(false)
  const hintId = useId()

  const label = brands?.find((b) => b.id === brandId)?.name ?? brand?.name

  // No name yet means no header: a placeholder here would flash on every
  // navigation into a brand, and unlike the workspace switcher there is no
  // "select one" state worth offering — you are either in a brand or you
  // aren't.
  if (!token || !brandId || !label) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            // Same reasoning as WorkspaceSwitcher, both halves: no `aria-label`,
            // or the active brand's name stops being the accessible name — and
            // `aria-describedby` at a sibling rather than the draft
            // `aria-description`, which a `button` does not support.
            aria-describedby={hintId}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-accent"
          >
            <BrandMark name={label} seed={brandId} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        {/* **`max-w-80` is the half that was missing, and only a long name
            shows it.** The items have said `truncate` since 1.6.0, but a
            dropdown with no maximum grows to fit its widest child, so the
            ellipsis never engaged: measured at 3G against a 90-character brand
            name, the menu opened **670px wide** — most of the page — and left
            all 32 short names rattling in rows sized for one long one. Capping
            the content is what makes the `truncate` on each row mean something.
            `max-h-80` was already here and is why 30+ brands scroll instead of
            running off the viewport; this is its horizontal twin. */}
        <DropdownMenuContent align="start" className="max-h-80 min-w-56 max-w-80 overflow-y-auto">
          {/* Radio semantics for the same reason as the workspace list — the
              check mark is opacity-only and would otherwise be visual-only. */}
          <DropdownMenuRadioGroup value={brandId}>
            {(brands ?? []).map((b) => (
              <DropdownMenuRadioItem
                key={b.id}
                value={b.id}
                onSelect={() => {
                  // Always the hub, never the equivalent page under the new
                  // brand: a project id belongs to the brand you just left,
                  // and a mini-app may not have a thread in the new one.
                  void navigate({ to: '/brands/$brandId', params: { brandId: b.id } })
                }}
              >
                <span className="min-w-0 truncate">{b.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {/* Create sits above the way out, as it does in `WorkspaceSwitcher`:
              the switcher is the one affordance reachable from every page in a
              brand, and adding a brand previously meant navigating up to
              workspace home first — the trip this pill exists to remove. */}
          <DropdownMenuItem
            disabled={!workspaceId}
            onSelect={() => {
              if (!workspaceId) return
              // Deferred for the same reason as WorkspaceSwitcher's: opening the
              // dialog in this tick leaves the menu's focus scope fighting the
              // dialog's. See `deferUntilMenuClosed`.
              setTimeout(() => setNewOpen(true), 0)
            }}
          >
            New brand…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!workspaceId}
            onSelect={() => {
              if (!workspaceId) return
              void navigate({ to: '/workspaces/$wsId', params: { wsId: workspaceId } })
            }}
          >
            All brands
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span id={hintId} className="sr-only">
        Switch brand
      </span>
      {/* No workspace resolved means no target for the POST, which is why the
          item above is disabled and this is not rendered at all. */}
      {workspaceId ? (
        <NewBrandDialog wsId={workspaceId} open={newOpen} onOpenChange={setNewOpen} />
      ) : null}
    </>
  )
}
