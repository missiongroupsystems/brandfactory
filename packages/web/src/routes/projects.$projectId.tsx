import { useCallback, useState } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { useProjectDetail } from '@/api/queries/projects'
import { useBreadcrumbTrail } from '@/components/Breadcrumbs'
import { useProjectStream } from '@/realtime/useProjectStream'
import { SplitScreen } from '@/components/project/SplitScreen'
import { TopBar } from '@/components/project/TopBar'
import { ChatPane } from '@/components/project/ChatPane'
import { CanvasPane } from '@/components/canvas/CanvasPane'
import { BrandContextPane } from '@/components/brand/BrandContextPane'
import { BRAND_CONTEXT_TEMPLATE_ID } from '@/components/brand/miniApps'
import type { CapturePayload } from '@/components/project/MessageCapture'

function ProjectPage() {
  const { projectId } = projectRoute.useParams()
  const { data, isLoading, error } = useProjectDetail(projectId)
  // The click path's hand-off between the two panes. The drag path needs no
  // state — the drop lands directly in the editor.
  const [staged, setStaged] = useState<CapturePayload | null>(null)
  const clearStaged = useCallback(() => setStaged(null), [])

  useProjectStream(projectId)
  useBreadcrumbTrail(
    data
      ? {
          brand: { id: data.brand.id, name: data.brand.name },
          project: { id: data.id, name: data.name },
        }
      : {},
  )

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading project…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-destructive">
        {error instanceof Error ? error.message : 'Project not found.'}
      </div>
    )
  }

  // ProjectDetail intersects the `kind`-discriminated ProjectSchema, so this
  // narrows without an API change. A brand-context thread swaps the canvas for
  // the live guidelines — you cannot drop into a target you cannot see, which is
  // what makes the Phase C capture gesture possible at all.
  //
  // Only the right pane branches. ChatPane is identical in every thread; the
  // capture handles it grows in Phase C are not brand-context-specific.
  const isBrandContext =
    data.kind === 'standardized' && data.templateId === BRAND_CONTEXT_TEMPLATE_ID

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar project={data} brand={data.brand} />
      <SplitScreen
        left={
          <ChatPane
            projectId={projectId}
            messages={data.recentMessages}
            // No capture target outside a brand-context thread until Phase E
            // gives one the dialog, and an affordance that lands nowhere is
            // worse than none.
            onCapture={isBrandContext ? setStaged : undefined}
          />
        }
        right={
          isBrandContext ? (
            // `data.brand` is already a full BrandWithSections, so this needs
            // no extra fetch.
            <BrandContextPane brand={data.brand} staged={staged} onStagedConsumed={clearStaged} />
          ) : (
            <CanvasPane
              projectId={data.id}
              blocks={data.blocks}
              shortlistBlockIds={data.shortlistBlockIds}
            />
          )
        }
      />
    </div>
  )
}

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: ProjectPage,
})
