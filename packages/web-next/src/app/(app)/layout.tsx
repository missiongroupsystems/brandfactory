import { AuthBoundary } from "@/auth/auth-boundary";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

/**
 * The application shell. A route group, so it wraps every page without appearing in a URL.
 *
 * A Server Component: the sidebar itself is a client component because it reads
 * `usePathname`, but the shell around it does not need to be, and marking the whole layout
 * `"use client"` would opt every page underneath out of server rendering by default.
 *
 * There is no desktop top bar (styleguide §7.1) — the page title and its actions sit at the
 * top of the content area. The bar below exists only on mobile, where the nav is off-canvas
 * and something has to open it.
 *
 * **`AuthBoundary` wraps everything, including the sidebar**, and that placement is
 * deliberate. The nav's header now reads a real workspace and a real brand from the API, and
 * its footer names the signed-in person; rendering any of that before there is a session
 * would put three requests on the wire that can only 401. It also means the fifteen
 * fixture-backed Operations Hub screens now sit behind sign-in, which is the intended change
 * rather than a side effect — this is the go-forward app, and until now its footer said the
 * gate was open.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthBoundary>
      <SidebarProvider>
        <AppSidebar />
        {/* min-w-0: without it the inset's min-width is its content's intrinsic width, so a
            wide table widens the whole page instead of scrolling inside its own card. */}
        <SidebarInset className="min-w-0">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
            <SidebarTrigger className="-ml-1" />
            <span className="text-helper text-ink-secondary">Marketing Hub</span>
          </header>
          <div className="flex-1">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AuthBoundary>
  );
}
