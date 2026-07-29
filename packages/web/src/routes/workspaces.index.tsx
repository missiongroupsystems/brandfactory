import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { NewWorkspaceDialog } from '@/components/NewWorkspaceDialog'
import { Button } from '@/components/ui/button'
import { ensureWorkspaces, resolveLandingWorkspaceId } from '@/lib/workspace-resolve'

function FirstRunPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="space-y-2">
          <h1>Create your first workspace</h1>
          <p className="text-sm text-muted-foreground">
            A <strong className="font-medium text-foreground">workspace</strong> is a container for
            your brands — think of it as a company or team. Inside it, each{' '}
            <strong className="font-medium text-foreground">brand</strong> holds guidelines and the
            projects where you ideate with an agent that already knows that brand.
          </p>
          <p className="text-sm text-muted-foreground">
            Start with a workspace. You can add brands and open the canvas from there.
          </p>
        </div>
        <NewWorkspaceDialog trigger={<Button size="default">Create workspace</Button>} />
      </div>
    </div>
  )
}

export const workspacesIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  loader: async () => {
    const workspaces = await ensureWorkspaces()
    if (workspaces.length === 0) return
    const wsId = resolveLandingWorkspaceId(workspaces)
    if (wsId) {
      throw redirect({ to: '/workspaces/$wsId', params: { wsId } })
    }
  },
  component: FirstRunPage,
})
