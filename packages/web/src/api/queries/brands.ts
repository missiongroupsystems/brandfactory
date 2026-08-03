import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  AutofillSectionResult,
  Brand,
  BrandGuidelineSection,
  BrandWithSections,
  ProjectDetail,
  ProjectSummary,
  UpdateBrandGuidelinesInput,
  UpdateBrandInput,
} from '@brandfactory/shared'
import { api, callJson } from '@/api/client'
import { workspaceKeys } from '@/api/queries/workspaces'

export const brandKeys = {
  detail: (id: string) => ['brands', id] as const,
  projects: (brandId: string) => ['brands', brandId, 'projects'] as const,
  assets: (brandId: string) => ['brands', brandId, 'assets'] as const,
  socialPosts: (brandId: string) => ['brands', brandId, 'social-posts'] as const,
  research: (brandId: string) => ['brands', brandId, 'research'] as const,
  // Keyed by job as well as brand: a re-run is a different report, and a key that
  // only named the brand would serve the previous run's document from cache.
  researchReport: (brandId: string, jobId: string) =>
    ['brands', brandId, 'research', jobId, 'report'] as const,
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

// The ['projects'] prefix in the applier below also matches ['projects', id,
// 'blocks' | 'messages' | 'shortlist'], whose cached data is an array — narrow
// on shape before spreading, or a guidelines save would quietly replace a block
// list with an object.
//
// The brand-id check below already excludes those (an array has no `.brand`),
// so the explicit array rejection is belt-and-braces: it is what keeps this
// honest if the brand check is ever loosened.
function isProjectDetailOfBrand(value: unknown, brandId: string): value is ProjectDetail {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const brand = (value as ProjectDetail).brand
  return typeof brand === 'object' && brand !== null && brand.id === brandId
}

/**
 * Repoint every cached copy of a brand's guideline sections after a save.
 *
 * There are two: `brands/:id` (the brand hub's context bar) and the `brand`
 * embedded in each `ProjectDetail` (which a brand-context thread's right pane
 * renders from). Patching only the first leaves the second stale, and the
 * visible editor would look correct right up until a refetch of the project
 * detail — React Query's default window-focus refetch will do it — put the
 * pre-save sections back beside it. That is the 1.4.0 I1 bug class, one layer
 * out.
 *
 * Exported and standalone so the cache contract is testable without standing up
 * a mutation, the same shape as `applyAgentEvent`.
 */
export function applyGuidelinesToCache(
  queryClient: QueryClient,
  brandId: string,
  sections: BrandGuidelineSection[],
): void {
  queryClient.setQueryData<BrandWithSections>(brandKeys.detail(brandId), (old) =>
    old ? { ...old, sections } : old,
  )
  // Literal key prefix rather than `projectKeys`: projects.ts already imports
  // `brandKeys` from here, so importing back would be an import cycle.
  queryClient.setQueriesData<unknown>({ queryKey: ['projects'] }, (old: unknown) =>
    isProjectDetailOfBrand(old, brandId) ? { ...old, brand: { ...old.brand, sections } } : old,
  )
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
    onSuccess: (sections) => applyGuidelinesToCache(queryClient, brandId, sections),
  })
}

/**
 * Auto-fill one guideline section: label in, draft (or an honest `no-material`)
 * out.
 *
 * **A plain mutation with no cache write, and that is the design, not an
 * omission**: the server persists nothing — the draft's destination is the
 * row's local editor state, and the user's ordinary Save is the commit through
 * `useUpdateBrandGuidelines`, the one guidelines writer. Writing anything into
 * the query cache here would claim a save that has not happened.
 *
 * Failure handling lives at the call site (the editor's toast), which is also
 * where the outcome vocabulary — `ok` / `no-material` / `invalid-shape` — is
 * turned into words.
 */
export function useAutofillSection(brandId: string) {
  return useMutation({
    mutationFn: async (label: string) => {
      const res = await api.brands[':id'].guidelines.autofill.$post({
        param: { id: brandId },
        json: { label },
      })
      return callJson<AutofillSectionResult>(res)
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
