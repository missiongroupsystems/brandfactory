import { useCallback, useState } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { useProjectDetail } from '@/api/queries/projects'
import { useProjectStream } from '@/realtime/useProjectStream'
import { SplitScreen } from '@/components/project/SplitScreen'
import { TopBar } from '@/components/project/TopBar'
import { ChatPane } from '@/components/project/ChatPane'
import { CanvasPane } from '@/components/canvas/CanvasPane'
import { BrandContextPane } from '@/components/brand/BrandContextPane'
import { EditGuidelinesDialog } from '@/components/brand/EditGuidelinesDialog'
import { BRAND_CONTEXT_TEMPLATE_ID } from '@/components/brand/miniApps'
import type { StagedSection } from '@/components/brand/BrandGuidelinesEditor'
import type { CapturePayload } from '@/components/project/MessageCapture'

function ProjectPage() {
  const { projectId } = projectRoute.useParams()
  const { data, isLoading, error } = useProjectDetail(projectId)
  // The click path's hand-off to whichever editor is in reach. The drag path
  // needs no state — the drop lands directly in the visible editor.
  // A one-item list since Stage 3E widened the channel for the research review
  // sheet. The gesture is unchanged — one message, one section — and it stays
  // one here: the alternative, accumulating captures into a batch, would put
  // the "when does this land?" question into a path that has always answered
  // it immediately.
  const [staged, setStaged] = useState<StagedSection[] | null>(null)
  const clearStaged = useCallback(() => setStaged(null), [])
  // Phase E: outside a brand-context thread the editor isn't on screen, so a
  // capture brings it up.
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false)

  useProjectStream(projectId)

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

  // One capture destination, reached two ways. In a brand-context thread the
  // editor is already the right pane, so the payload just goes to it; anywhere
  // else the same payload opens the dialog over the canvas. Same prop shape,
  // same staging effect, same sole writer of the guidelines.
  //
  // Whether a dialog exists at all is decided in one place, below — this does
  // not re-test it. Two guards for one property mask each other, and neither
  // ends up pinned by a test.
  const capture = (payload: CapturePayload) => {
    setStaged([{ payload }])
    setCaptureDialogOpen(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar project={data} brand={data.brand} />
      <SplitScreen
        left={
          <ChatPane
            projectId={projectId}
            messages={data.recentMessages}
            onCapture={capture}
            // Only a brand-context thread has the editor on screen to drop
            // into; elsewhere the dialog is closed until a capture opens it.
            hasDropTarget={isBrandContext}
            // Present only when this thread is a landed research report: the
            // run's citations, so the report's `[n]` markers link out.
            citationSources={data.researchSources}
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
      {/* `data.brand` is already a full BrandWithSections, so this needs no
          fetch of its own — and no second caller of the guidelines write: the
          dialog frames the same editor the pane does. */}
      {!isBrandContext && (
        <EditGuidelinesDialog
          brand={data.brand}
          open={captureDialogOpen}
          onOpenChange={setCaptureDialogOpen}
          staged={staged}
          onStagedConsumed={clearStaged}
        />
      )}
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
