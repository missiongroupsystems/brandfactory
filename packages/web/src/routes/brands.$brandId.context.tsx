import { useState } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { useBrand, useBrandProjects } from '@/api/queries/brands'
import { BrandContextRail } from '@/components/brand/BrandContextRail'
import { EditGuidelinesDialog } from '@/components/brand/EditGuidelinesDialog'
import { BRAND_CONTEXT_TEMPLATE_ID, isBrandContextThread } from '@/components/brand/miniApps'
import { PageHeader } from '@/components/layout/PageHeader'
import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import { ProjectCard } from '@/components/project/ProjectCard'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Brand context — the conversations, beside what they exist to build
// ---------------------------------------------------------------------------
//
// The mini-app page's shape at a path that is deliberately NOT under `/apps/`:
// brand context is not a category of creative work sitting beside Copywriting,
// it is what those categories read from (see the `context` row's comment in
// miniApps.ts). Reached from the brand context bar.
//
// The page shows two things, and they are halves of one loop: the brand's
// conversations (where context gets talked out) and the guideline blocks
// (where whatever landed gets written down). The blocks are the same
// `BrandContextRail` the hub shows — written sections and unwritten
// suggestions, one list — so arriving here answers "what do we know?" without
// a detour back to Overview. The rail's `Talk it through` link is off: it
// points at this page.
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
  const [editOpen, setEditOpen] = useState(false)

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
      <PageHeader
        title="Brand context"
        icon={MessagesSquare}
        description="Talk the brand out with an agent that already knows it. Anything that lands, you capture into the guidelines yourself."
        action={
          brand && (
            <NewProjectDialog
              brandId={brand.id}
              workspaceId={brand.workspaceId}
              templateId={BRAND_CONTEXT_TEMPLATE_ID}
              title="New conversation"
              trigger={<Button size="sm">New conversation</Button>}
            />
          )
        }
      />

      {listError && (
        <p className="text-sm text-destructive">
          {brandError ? 'Failed to load this brand.' : 'Failed to load conversations.'}
        </p>
      )}
      {!listError && listPending && (
        <p className="text-sm text-muted-foreground">Loading conversations…</p>
      )}
      {!listError && !listPending && brand && (
        <>
          <div className="flex flex-col gap-6 lg:flex-row">
            <main className="min-w-0 flex-1">
              {conversations.length > 0 ? (
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
                // An invitation, not an error: an empty brand context is the
                // normal starting state for a brand that arrives as a rough
                // idea.
                <p className="text-sm text-muted-foreground">
                  No conversations yet. Start one and think out loud — who this is for, what it
                  would never say. Whatever lands, you drag into the brand&apos;s guidelines.
                </p>
              )}
            </main>

            {/* The same width discipline as the hub: stacked below `lg`, the
                rail must not stretch to page width — that is the 1.4.0
                `BrandContextBar` shape the rail exists to replace. No tile
                grid here to align with, so the cap is the rail's own natural
                width rather than the hub's half-grid calc. */}
            <BrandContextRail
              brand={brand}
              onEdit={() => setEditOpen(true)}
              showTalkLink={false}
              className="sm:max-w-sm lg:w-80 lg:max-w-none lg:shrink-0"
            />
          </div>

          <EditGuidelinesDialog brand={brand} open={editOpen} onOpenChange={setEditOpen} />
        </>
      )}
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
