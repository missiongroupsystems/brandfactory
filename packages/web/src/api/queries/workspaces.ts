import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BrandSummary,
  ProjectSummary,
  UpdateWorkspaceInput,
  Workspace,
} from '@brandfactory/shared'
import { api, callJson } from '@/api/client'

export const workspaceKeys = {
  all: () => ['workspaces'] as const,
  detail: (id: string) => ['workspaces', id] as const,
  brands: (wsId: string) => ['workspaces', wsId, 'brands'] as const,
  projects: (wsId: string) => ['workspaces', wsId, 'projects'] as const,
}

export function useWorkspaces(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: workspaceKeys.all(),
    enabled: opts?.enabled !== false,
    queryFn: async () => {
      const res = await api.workspaces.$get()
      return callJson<Workspace[]>(res)
    },
  })
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: workspaceKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const res = await api.workspaces[':id'].$get({ param: { id } })
      return callJson<Workspace>(res)
    },
  })
}

// Wire shape is BrandSummary (row + section/project counts) as of Phase 9C.
export function useWorkspaceBrands(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.brands(workspaceId),
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await api.workspaces[':workspaceId'].brands.$get({
        param: { workspaceId },
      })
      return callJson<BrandSummary[]>(res)
    },
  })
}

/** Recent-work strip — projects across every brand in the workspace (D1 ordering). */
export function useWorkspaceProjects(workspaceId: string, limit = 10) {
  return useQuery({
    queryKey: [...workspaceKeys.projects(workspaceId), limit] as const,
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await api.workspaces[':workspaceId'].projects.$get({
        param: { workspaceId },
        query: { limit: String(limit) },
      })
      return callJson<ProjectSummary[]>(res)
    },
  })
}

export function useUpdateWorkspace(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateWorkspaceInput) => {
      const res = await api.workspaces[':id'].$patch({
        param: { id: workspaceId },
        json: input,
      })
      return callJson<Workspace>(res)
    },
    onSuccess: (workspace) => {
      queryClient.setQueryData(workspaceKeys.detail(workspaceId), workspace)
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all() })
    },
  })
}
