import { useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { LayoutGrid, Plus, Settings } from 'lucide-react'
import { useWorkspace, useWorkspaceBrands } from '@/api/queries/workspaces'
import { NewBrandDialog } from '@/components/NewBrandDialog'
import { NavAction, NavGroup, NavItem } from '@/components/nav/NavPrimitives'
import { workspaceNavKey } from '@/lib/nav-active'

// ---------------------------------------------------------------------------
// WorkspaceNavPanel — the second column, when you are not inside a brand
// ---------------------------------------------------------------------------
//
// Workspace home and workspace settings are the only two routes that land here,
// and the panel's real content is the third thing: the brands, by name.
//
// **The rail lists the same brands, and that is not the duplication it looks
// like.** The rail is 40 unlabelled squares you learn by colour; this is the
// list you read when you do not know them yet — a new user, a new workspace, or
// a workspace of eight brands whose names all begin with the same word. It is
// also the only one of the two that can carry `New brand…` as a labelled row.
//
// There is no switcher in this header. The workspace is switched from the rail's
// tile, one column left and always in the same place; a second dropdown naming
// the same thing would be the two-pills-in-twelve-pixels problem 1.7.0's
// breadcrumb note was written about.

export function WorkspaceNavPanel({ workspaceId }: { workspaceId: string }) {
  const pathname = useLocation({ select: (l) => l.pathname })
  const { data: workspace } = useWorkspace(workspaceId)
  const { data: brands } = useWorkspaceBrands(workspaceId)
  const [newOpen, setNewOpen] = useState(false)

  const activeKey = workspaceNavKey(pathname, workspaceId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Not a button, and not a placeholder either: the name arrives on the
          workspace query, and until it does the row is the same height with
          nothing in it — the alternative flashes "Workspace" on every load of
          every page in the shell. */}
      {/* `<header>`, and generic rather than `banner` — it is a descendant of
          the shell's `<aside>`, which is exactly the containment ARIA uses to
          decide that. `h-16` on both panel headers keeps the divider under them
          on one line across a scope change. */}
      <header className="flex h-16 shrink-0 items-center border-b px-4">
        <span className="min-w-0 truncate text-sm font-medium">{workspace?.name ?? ''}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <NavGroup>
          <NavItem
            link={{ to: '/workspaces/$wsId', params: { wsId: workspaceId } }}
            label="Overview"
            icon={LayoutGrid}
            active={activeKey === 'overview'}
          />
        </NavGroup>

        <NavGroup label="Brands">
          {(brands ?? []).map((b) => (
            <NavItem
              key={b.id}
              link={{ to: '/brands/$brandId', params: { brandId: b.id } }}
              label={b.name}
              // Never `active`: this panel only renders outside a brand, so a
              // row here can be the destination but never the current page.
              count={b.projectCount}
            />
          ))}
          <NavAction label="New brand…" icon={Plus} onClick={() => setNewOpen(true)} />
        </NavGroup>

        <NavGroup label="Workspace">
          <NavItem
            link={{ to: '/workspaces/$wsId/settings', params: { wsId: workspaceId } }}
            label="Settings"
            icon={Settings}
            active={activeKey === 'settings'}
          />
        </NavGroup>
      </div>

      <NewBrandDialog wsId={workspaceId} open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}
