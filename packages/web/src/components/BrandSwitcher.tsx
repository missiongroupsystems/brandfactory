import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown } from 'lucide-react'
import { useAuthStore } from '@/auth/store'
import { useBrand } from '@/api/queries/brands'
import { useWorkspaceBrands } from '@/api/queries/workspaces'
import { useActiveBrandId } from '@/lib/active-brand'
import { useActiveWorkspaceId } from '@/lib/workspace-context'
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
        <DropdownMenuContent align="start" className="max-h-80 min-w-48 overflow-y-auto">
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
                <span className="truncate">{b.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
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
    </>
  )
}
