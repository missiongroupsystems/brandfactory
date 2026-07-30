import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown } from 'lucide-react'
import { useAuthStore } from '@/auth/store'
import { useWorkspaces } from '@/api/queries/workspaces'
import { useActiveWorkspaceId } from '@/lib/workspace-context'
import { setLastWorkspaceId } from '@/lib/last-workspace'
import { NewWorkspaceDialog } from '@/components/NewWorkspaceDialog'
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

export function WorkspaceSwitcher() {
  const token = useAuthStore((s) => s.token)
  const { data: workspaces } = useWorkspaces({ enabled: !!token })
  const activeId = useActiveWorkspaceId()
  const navigate = useNavigate()
  const [newOpen, setNewOpen] = useState(false)

  if (!token || !workspaces?.length) return null

  const current = workspaces.find((w) => w.id === activeId)
  const label = current?.name ?? 'Select workspace'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 max-w-56 justify-between gap-1.5 font-normal"
            // No `aria-label` — it would override the button's text and hide
            // which workspace is active from assistive tech. The visible name
            // is the accessible name; this only adds the missing context.
            aria-description="Switch workspace"
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        {/* Capped for the same reason as BrandSwitcher's, which is where a long
            name made the defect visible: `truncate` on a row does nothing while
            the menu is free to grow to the widest one. A workspace name has the
            same freedom as a brand name, so it gets the same ceiling. */}
        <DropdownMenuContent align="start" className="min-w-48 max-w-80">
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
      <NewWorkspaceDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  )
}
