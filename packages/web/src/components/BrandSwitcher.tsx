import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown } from 'lucide-react'
import { useAuthStore } from '@/auth/store'
import { useBrand } from '@/api/queries/brands'
import { useWorkspaceBrands } from '@/api/queries/workspaces'
import { useActiveBrandId } from '@/lib/active-brand'
import { useActiveWorkspaceId } from '@/lib/workspace-context'
import { NewBrandDialog } from '@/components/NewBrandDialog'
import { Button } from '@/components/ui/button'
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
 * Brand peer of `WorkspaceSwitcher`. Present only while the shell is inside a
 * brand — a brand hub, a mini-app page, a brand-context thread, or a project —
 * and absent everywhere else.
 *
 * Each header segment renders its own **leading** separator, so a segment that
 * returns `null` cannot strand a divider next to it. `Breadcrumbs` follows the
 * same rule for the tail.
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

  const label = brands?.find((b) => b.id === brandId)?.name ?? brand?.name

  // No name yet means no pill: a placeholder here would flash on every
  // navigation into a brand, and unlike the workspace switcher there is no
  // "select one" state worth offering — you are either in a brand or you
  // aren't.
  if (!token || !brandId || !label) return null

  return (
    <>
      <span aria-hidden="true" className="shrink-0 text-sm text-muted-foreground">
        /
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 max-w-56 justify-between gap-1.5 font-normal"
            // Same reasoning as WorkspaceSwitcher: no `aria-label`, or the
            // active brand's name stops being the accessible name.
            aria-description="Switch brand"
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
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
        <DropdownMenuContent align="start" className="max-h-80 min-w-48 max-w-80 overflow-y-auto">
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
      {/* No workspace resolved means no target for the POST, which is why the
          item above is disabled and this is not rendered at all. */}
      {workspaceId ? (
        <NewBrandDialog wsId={workspaceId} open={newOpen} onOpenChange={setNewOpen} />
      ) : null}
    </>
  )
}
