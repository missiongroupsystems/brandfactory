import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, callJson } from '@/api/client'
import { workspaceKeys } from '@/api/queries/workspaces'

/**
 * The structure write-through's client half.
 *
 * Plan: phase 9e/9f. Decision: proposal §7 and §8 `D1-b`.
 *
 * Everything here is **gated on the server**, in `routes/passport-structure.ts`. These hooks
 * exist so the UI can tell "you cannot do this" from "this feature does not exist here" —
 * which without `/me` it cannot, and so shows neither.
 */

export const passportKeys = {
  me: () => ['passport', 'me'] as const,
  drift: (wsId: string) => ['passport', 'drift', wsId] as const,
}

export interface StructurePermission {
  canWriteStructure: boolean
  organizationId: string | null
  orgRole?: string
  reason?: string
}

/**
 * May this person change structure, and where?
 *
 * **Never `throwOnError`, and a failure is treated as `false`.** Most people are not org
 * Admins, and most deployments have no Passport at all — so a "failure" here is the ordinary
 * case, not an exception. Surfacing it would put a red toast on every page load for everyone.
 */
export function useStructurePermission() {
  return useQuery({
    queryKey: passportKeys.me(),
    // The answer changes only when somebody's Passport role changes, which arrives by sync
    // rather than by anything this tab did.
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<StructurePermission> => {
      try {
        const res = await api.passport.structure.me.$get()
        return await callJson<StructurePermission>(res)
      } catch {
        return { canWriteStructure: false, organizationId: null }
      }
    },
  })
}

export interface WorkspaceDrift {
  diverged: { brandId: string; displayName: string; legalName: string; unitId: string }[]
  unlinked: { brandId: string; displayName: string }[]
}

/**
 * The drift view's data.
 *
 * `enabled` on the permission, because the route is Admin-gated and firing it for everybody
 * would put a 403 in every non-Admin's console on every settings visit.
 */
export function useWorkspaceDrift(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: passportKeys.drift(workspaceId),
    enabled: enabled && workspaceId !== '',
    retry: false,
    queryFn: async () => {
      const res = await api.passport.structure.workspaces[':workspaceId'].drift.$get({
        param: { workspaceId },
      })
      return callJson<WorkspaceDrift>(res)
    },
  })
}

/**
 * Promote a local brand into a Passport unit.
 *
 * **Invalidates the brand list as well as the drift view**, because the brand's
 * `linkedToPassport` changes — and it changes by EVENT, a moment after this resolves. The
 * response says `pending: true` for exactly that reason, so a refetch immediately after may
 * still show it unlinked. That is correct, and the UI says "adding…" rather than claiming it
 * is done.
 */
export function usePromoteBrand(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (brandId: string) => {
      const res = await api.passport.structure.brands[':brandId'].promote.$post({
        param: { brandId },
      })
      return callJson<{ brandId: string; unitId: string; pending?: boolean; warning?: string }>(res)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: passportKeys.drift(workspaceId) })
      void qc.invalidateQueries({ queryKey: workspaceKeys.brands(workspaceId) })
    },
  })
}
