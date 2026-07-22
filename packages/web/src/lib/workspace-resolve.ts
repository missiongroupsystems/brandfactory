import type { Workspace } from '@brandfactory/shared'
import { api, callJson, queryClient } from '@/api/client'
import { workspaceKeys } from '@/api/queries/workspaces'
import { resolveLandingWorkspaceId } from '@/lib/workspace-context'

/** Ensure the workspace list is in the React Query cache (loaders + shell). */
export async function ensureWorkspaces(): Promise<Workspace[]> {
  return queryClient.ensureQueryData({
    queryKey: workspaceKeys.all(),
    queryFn: async () => {
      const res = await api.workspaces.$get()
      return callJson<Workspace[]>(res)
    },
  })
}

export { resolveLandingWorkspaceId }
