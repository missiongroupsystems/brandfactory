import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Brand,
  BrandGuidelineSection,
  BrandWithSections,
  ProjectSummary,
  UpdateBrandGuidelinesInput,
  UpdateBrandInput,
} from '@brandfactory/shared'
import { api, callJson } from '@/api/client'
import { workspaceKeys } from '@/api/queries/workspaces'

export const brandKeys = {
  detail: (id: string) => ['brands', id] as const,
  projects: (brandId: string) => ['brands', brandId, 'projects'] as const,
}

export function useBrand(id: string) {
  return useQuery({
    queryKey: brandKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const res = await api.brands[':id'].$get({ param: { id } })
      return callJson<BrandWithSections>(res)
    },
  })
}

export function useUpdateBrandGuidelines(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateBrandGuidelinesInput) => {
      const res = await api.brands[':id'].guidelines.$patch({
        param: { id: brandId },
        json: input,
      })
      return callJson<BrandGuidelineSection[]>(res)
    },
    onSuccess: (sections) => {
      queryClient.setQueryData<BrandWithSections>(brandKeys.detail(brandId), (old) =>
        old ? { ...old, sections } : old,
      )
    },
  })
}

// Wire shape is ProjectSummary (row + brandName + true lastActivityAt), so the
// brand hub renders the same activity value as the workspace-home strip.
export function useBrandProjects(brandId: string) {
  return useQuery({
    queryKey: brandKeys.projects(brandId),
    enabled: !!brandId,
    queryFn: async () => {
      const res = await api.brands[':brandId'].projects.$get({ param: { brandId } })
      return callJson<ProjectSummary[]>(res)
    },
  })
}

export function useUpdateBrand(brandId: string, workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateBrandInput) => {
      const res = await api.brands[':id'].$patch({
        param: { id: brandId },
        json: input,
      })
      return callJson<Brand>(res)
    },
    onSuccess: (brand) => {
      queryClient.setQueryData<BrandWithSections>(brandKeys.detail(brandId), (old) =>
        old ? { ...old, ...brand } : old,
      )
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.brands(workspaceId) })
      // ProjectSummary carries `brandName`, so a rename goes stale on both
      // project lists until they refetch (staleTime is 30s — long enough to see).
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.projects(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: brandKeys.projects(brandId) })
    },
  })
}

export function useDeleteBrand(brandId: string, workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.brands[':id'].$delete({ param: { id: brandId } })
      return callJson<Brand>(res)
    },
    onSuccess: () => {
      void queryClient.removeQueries({ queryKey: brandKeys.detail(brandId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.brands(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.projects(workspaceId) })
    },
  })
}
