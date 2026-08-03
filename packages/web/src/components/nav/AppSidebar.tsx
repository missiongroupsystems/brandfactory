import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAuthStore } from '@/auth/store'
import { BrandRail } from '@/components/nav/BrandRail'
import { BrandNavPanel } from '@/components/nav/BrandNavPanel'
import { WorkspaceNavPanel } from '@/components/nav/WorkspaceNavPanel'
import { useActiveBrandId } from '@/lib/active-brand'
import { getPanelCollapsed, setPanelCollapsed } from '@/lib/sidebar-prefs'
import { useActiveWorkspaceId } from '@/lib/workspace-context'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// AppSidebar — the two stacked columns, and which panel is in the second one
// ---------------------------------------------------------------------------
//
//   rail (56px)     every brand in the workspace, always the same list
//   panel (240px)   where you are: the brand's apps, or the workspace's brands
//
// **The panel is scoped, not routed.** It asks `useActiveBrandId`, which is the
// same resolver the old header pill used and already answers for a project
// route — a thread has no `brandId` in its path, and the panel has to keep
// showing that brand's apps while you are inside one. Falling back to the
// workspace panel would empty the sidebar the moment you opened a thread, which
// is the exact page a persistent nav is most worth having.
//
// **It renders nothing without a token.** The login route mounts the same shell,
// and a sidebar there would be a column of queries that 401 behind a form.

export function AppSidebar({
  mobileOpen,
  onCloseMobile,
}: {
  /** The `lg:hidden` drawer is open. Owned by the shell; see `__root`. */
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const workspaceId = useActiveWorkspaceId()
  const brandId = useActiveBrandId()
  const pathname = useLocation({ select: (l) => l.pathname })
  const [collapsed, setCollapsed] = useState(getPanelCollapsed)

  const togglePanel = useCallback(() => {
    setCollapsed((prev) => {
      setPanelCollapsed(!prev)
      return !prev
    })
  }, [])

  // Navigating from inside the drawer must dismiss it, or the page you asked
  // for is delivered underneath the thing you asked for it from. Keyed on the
  // path rather than on each link's `onClick`, so a redirect, a `<Link>` added
  // later and the back button all behave the same.
  //
  // **The ref is what makes it a transition rather than a state.** An effect on
  // `[pathname]` also runs at mount, which would close a drawer that was opened
  // in the same commit it mounted in; comparing against the previous value fires
  // only on an actual change.
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    if (mobileOpen) onCloseMobile()
  }, [pathname, mobileOpen, onCloseMobile])

  if (!token) return null

  return (
    <>
      {/* Backdrop, mobile only and only while open. A sibling rather than a
          parent so the drawer is not inside a stacking context it dims. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-[var(--c-ink-900)]/40 lg:hidden"
        />
      )}

      <aside
        aria-label="Main"
        className={cn(
          'flex shrink-0 bg-card',
          // Closed on a narrow screen it is `hidden`, not translated off-screen:
          // an off-screen nav still takes tab focus, and "tab three times into a
          // menu you cannot see" is the sort of thing that only shows up in a
          // keyboard audit months later.
          mobileOpen ? 'fixed inset-y-0 left-0 z-50 lg:static lg:z-auto' : 'hidden lg:flex',
        )}
      >
        <BrandRail
          workspaceId={workspaceId}
          panelCollapsed={collapsed}
          onTogglePanel={togglePanel}
        />

        {/* Folded away on desktop only — inside the drawer the panel *is* the
            navigation, and a fold that hid it would leave a 56px strip floating
            over the page. */}
        <div className={cn('w-60 shrink-0 border-r', collapsed && 'lg:hidden')}>
          {brandId ? (
            <BrandNavPanel brandId={brandId} />
          ) : workspaceId ? (
            <WorkspaceNavPanel workspaceId={workspaceId} />
          ) : null}
        </div>
      </aside>
    </>
  )
}
