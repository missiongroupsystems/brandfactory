import { createRoute, redirect } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { useBrand, useBrandProjects } from '@/api/queries/brands'
import { useBreadcrumbTrail } from '@/components/Breadcrumbs'
import { BRAND_CONTEXT_TEMPLATE_ID, isBrandContextThread } from '@/components/brand/miniApps'
import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import { ProjectCard } from '@/components/project/ProjectCard'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Brand context conversations — the list of a brand's recorded conversations
// ---------------------------------------------------------------------------
//
// The mini-app page's shape at a path that is deliberately NOT under `/apps/`:
// brand context is not a category of creative work sitting beside Copywriting,
// it is what those categories read from (see the `context` row's comment in
// miniApps.ts). Reached from the brand context bar.
//
// Nothing is created implicitly on arrival. An icon that silently spawns a
// thread leaves strays behind; "resume the most recent" is wrong the first time
// you want a fresh line of thinking. You pick, or you start a new one.

function BrandContextPage() {
  const { brandId } = brandContextRoute.useParams()
  const { data: brand, isPending: brandPending, isError: brandError } = useBrand(brandId)
  const {
    data: projects,
    isPending: threadsPending,
    isError: threadsError,
  } = useBrandProjects(brandId)

  // A conversation list has no entity id of its own, so it occupies the
  // breadcrumb's `leaf` slot rather than the project one — same as a mini-app.
  useBreadcrumbTrail({ leaf: { name: 'Brand context' } })

  // Client-side filter, per the 1.4.0 non-goal: the threads endpoint is
  // per-brand and the list is small enough that a server-side template filter
  // would be premature.
  const conversations = projects?.filter(isBrandContextThread) ?? []

  // ProjectCard needs a `workspaceId`, which only the brand query supplies, so
  // the list is gated on BOTH queries. Collapsing them into one pending/error
  // pair is what keeps a failed brand fetch from rendering a blank page with no
  // explanation (the 1.4.0 I2 regression) — the threads may have loaded fine.
  const listPending = brandPending || threadsPending
  const listError = brandError || threadsError

  return (
    <div className="flex-1 overflow-auto p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <MessagesSquare className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            Brand context
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Talk the brand out with an agent that already knows it. Anything that lands, you capture
            into the guidelines yourself.
          </p>
        </div>
        {brand && (
          <NewProjectDialog
            brandId={brand.id}
            workspaceId={brand.workspaceId}
            templateId={BRAND_CONTEXT_TEMPLATE_ID}
            title="New conversation"
            trigger={<Button size="sm">New conversation</Button>}
          />
        )}
      </header>

      {listError && (
        <p className="text-sm text-destructive">
          {brandError ? 'Failed to load this brand.' : 'Failed to load conversations.'}
        </p>
      )}
      {!listError && listPending && (
        <p className="text-sm text-muted-foreground">Loading conversations…</p>
      )}
      {!listError &&
        !listPending &&
        brand &&
        (conversations.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {conversations.map((p) => (
              <ProjectCard
                key={p.id}
                id={p.id}
                name={p.name}
                kind={p.kind}
                brandId={brand.id}
                workspaceId={brand.workspaceId}
                lastActivityAt={p.lastActivityAt}
                showBrandName={false}
              />
            ))}
          </div>
        ) : (
          // An invitation, not an error: an empty brand context is the normal
          // starting state for a brand that arrives as a rough idea.
          <p className="text-sm text-muted-foreground">
            No conversations yet. Start one and think out loud — who this is for, what it would
            never say. Whatever lands, you drag into the brand&apos;s guidelines.
          </p>
        ))}
    </div>
  )
}

export const brandContextRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/brands/$brandId/context',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: BrandContextPage,
})
