import { useState } from 'react'
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { AuthBoundary } from '@/auth/AuthBoundary'
import { useAuthStore } from '@/auth/store'
import { AppSidebar } from '@/components/nav/AppSidebar'
import { useActiveWorkspaceId } from '@/lib/workspace-context'

// ---------------------------------------------------------------------------
// The shell — a side-nav and a scrolling content area, and nothing else
// ---------------------------------------------------------------------------
//
// **The header strip is gone.** Since 0.9.0 the shell has been a 48px band
// holding a wordmark, a workspace pill, a brand pill and a breadcrumb tail, and
// every pass since has added one more thing to it — the research chip in 1.13.0,
// create in 1.12.0 — because a strip is the only place a shell with no other
// furniture *has*. Styleguide §7.1 describes the shape this repo has been
// approximating: a persistent left side-nav plus a scrollable content area, with
// **no separate top bar** — the page's title and its primary action sit at the
// top of the content, where the page can own them.
//
// What each piece of the strip became:
//
//   wordmark          the rail's workspace tile, which also navigates home
//   workspace pill    the same tile's menu (`WorkspaceSwitcher`)
//   brand pill        the brand panel's header (`BrandSwitcher`)
//   breadcrumb tail   deleted — see below
//   research chip     the brand panel's footer, beside the brand it belongs to
//   theme toggle      the rail's foot
//
// **The breadcrumbs are deleted rather than moved.** The tail was one segment
// deep by construction (`BreadcrumbTrail` is a project *or* a leaf, never both),
// and every route that set one now has its own row in the panel two columns
// left, lit, with its siblings under it. A trail that repeats the highlighted
// nav row is the same name twice in twelve pixels — the argument the trail's own
// doc comment used to drop the brand crumb when the brand pill arrived, applied
// one level on to the trail itself.
//
// The one thing a strip did that a rail cannot is give a narrow screen a place
// to put a menu button, which is what `lg:hidden` band below is and all it is.

function RootLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      {/* **A cost this pass introduced, and pays back here.** The old header
          held four controls; the sidebar holds a row per brand plus a row per
          app plus every thread of the category you are in, all of them before
          the content in DOM order. Without this, reaching the page by keyboard
          means tabbing through the whole navigation on every single load.
          Visible only on focus — `sr-only` until then, which is the pattern's
          whole point. */}
      <a
        href="#main-content"
        className="sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:not-sr-only focus:rounded-lg focus:border focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <AppSidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar onOpenNav={() => setMobileNavOpen(true)} />
        {/* `tabIndex={-1}` so the skip link can actually move focus here — an
            anchor to a container that cannot hold focus scrolls the page and
            leaves the tab ring back in the nav. */}
        <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 overflow-hidden">
          <AuthBoundary>
            <Outlet />
          </AuthBoundary>
        </main>
      </div>

      <Toaster />
    </div>
  )
}

/**
 * The narrow-screen way into the nav, and the only chrome above the content on
 * any screen. Absent from `lg` up, where the sidebar is always on.
 *
 * **And absent without a token**, for the same reason `AppSidebar` is: the login
 * route mounts this shell, the sidebar there is nothing, and a menu button that
 * opens nothing is the dead affordance this repo keeps deleting. The login page
 * carries its own wordmark, so nothing is lost by standing down.
 */
function MobileBar({ onOpenNav }: { onOpenNav: () => void }) {
  const token = useAuthStore((s) => s.token)
  const wsId = useActiveWorkspaceId()
  // Medium 500 — hierarchy from weight on Satoshi, not a second family.
  const className = 'text-[15px] font-medium tracking-tight text-foreground'

  if (!token) return null

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3 lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Open navigation"
        onClick={onOpenNav}
      >
        <Menu className="size-4" />
      </Button>
      {wsId ? (
        <Link to="/workspaces/$wsId" params={{ wsId }} className={className}>
          BrandFactory
        </Link>
      ) : (
        <Link to="/workspaces" className={className}>
          BrandFactory
        </Link>
      )}
    </div>
  )
}

export const rootRoute = createRootRoute({ component: RootLayout })
