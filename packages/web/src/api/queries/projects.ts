import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AgentMessage,
  CanvasBlock,
  Project,
  ProjectDetail,
  UpdateProjectInput,
} from '@brandfactory/shared'
import { api, callJson } from '@/api/client'
import { brandKeys } from '@/api/queries/brands'
import { workspaceKeys } from '@/api/queries/workspaces'

export const projectKeys = {
  detail: (id: string) => ['projects', id] as const,
  blocks: (id: string) => ['projects', id, 'blocks'] as const,
  messages: (id: string) => ['projects', id, 'messages'] as const,
  shortlist: (id: string) => ['projects', id, 'shortlist'] as const,
}

/** Freeform-only create for Phase 9. Invalidates brand + workspace project lists. */
export function useCreateProject(brandId: string, workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await api.brands[':brandId'].projects.$post({
        param: { brandId },
        json: { kind: 'freeform', name },
      })
      return callJson<Project>(res)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: brandKeys.projects(brandId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.projects(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.brands(workspaceId) })
    },
  })
}

export function useUpdateProject(projectId: string, brandId: string, workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateProjectInput) => {
      const res = await api.projects[':id'].$patch({
        param: { id: projectId },
        json: input,
      })
      return callJson<Project>(res)
    },
    onSuccess: (project) => {
      queryClient.setQueryData<ProjectDetail>(projectKeys.detail(projectId), (old) =>
        old ? { ...old, ...project } : old,
      )
      void queryClient.invalidateQueries({ queryKey: brandKeys.projects(brandId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.projects(workspaceId) })
    },
  })
}

export function useDeleteProject(projectId: string, brandId: string, workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.projects[':id'].$delete({ param: { id: projectId } })
      return callJson<Project>(res)
    },
    onSuccess: () => {
      void queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) })
      void queryClient.invalidateQueries({ queryKey: brandKeys.projects(brandId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.projects(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.brands(workspaceId) })
    },
  })
}

export function useProjectDetail(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const res = await api.projects[':id'].$get({ param: { id } })
      return callJson<ProjectDetail>(res)
    },
  })
}

export function useProjectBlocks(id: string) {
  return useQuery({
    queryKey: projectKeys.blocks(id),
    enabled: !!id,
    queryFn: async () => {
      const res = await api.projects[':id']['canvas']['blocks'].$get({ param: { id } })
      return callJson<CanvasBlock[]>(res)
    },
  })
}

export function useProjectMessages(id: string, limit?: number) {
  return useQuery({
    queryKey: projectKeys.messages(id),
    enabled: !!id,
    queryFn: async () => {
      const res = await api.projects[':id'].messages.$get({
        param: { id },
        query: limit !== undefined ? { limit: String(limit) } : {},
      })
      return callJson<AgentMessage[]>(res)
    },
  })
}
