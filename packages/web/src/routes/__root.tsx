import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AuthBoundary } from '@/auth/AuthBoundary'
import { BreadcrumbProvider, Breadcrumbs } from '@/components/Breadcrumbs'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { useActiveWorkspaceId } from '@/lib/workspace-context'

function Wordmark() {
  const wsId = useActiveWorkspaceId()
  // Medium 500 — hierarchy from weight on Satoshi, not a second family.
  const className = 'text-[15px] font-medium tracking-tight text-foreground'
  if (wsId) {
    return (
      <Link to="/workspaces/$wsId" params={{ wsId }} className={className}>
        BrandFactory
      </Link>
    )
  }
  return (
    <Link to="/workspaces" className={className}>
      BrandFactory
    </Link>
  )
}

function RootLayout() {
  return (
    <BreadcrumbProvider>
      <div className="flex h-screen flex-col bg-background">
        {/* Raised chrome on sunken page canvas — flat product surface, no glass. */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
          <Wordmark />
          <WorkspaceSwitcher />
          <div className="min-w-0 flex-1">
            <Breadcrumbs />
          </div>
          <ThemeToggle />
        </header>
        <main className="flex flex-1 overflow-hidden">
          <AuthBoundary>
            <Outlet />
          </AuthBoundary>
        </main>
        <Toaster />
      </div>
    </BreadcrumbProvider>
  )
}

export const rootRoute = createRootRoute({ component: RootLayout })
