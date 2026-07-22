import { useParams } from '@tanstack/react-router'
import { useAuthStore } from '@/auth/store'
import { useBrand } from '@/api/queries/brands'
import { useProjectDetail } from '@/api/queries/projects'
import { useWorkspaces } from '@/api/queries/workspaces'
import { getLastWorkspaceId } from '@/lib/last-workspace'
import type { Workspace } from '@brandfactory/shared'

/**
 * Pure resolution for the active workspace id. Prefer a route-scoped id
 * (workspace / brand / project page); fall back to storage only when that
 * id still exists in the user's workspace list. Empty list → null.
 *
 * Extracted for unit tests — the hook below is a thin wrapper.
 */
export function resolveActiveWorkspaceId(input: {
  routeWorkspaceId: string | null
  storedId: string | null
  workspaceIds: string[]
}): string | null {
  if (input.routeWorkspaceId) return input.routeWorkspaceId
  if (input.storedId && input.workspaceIds.includes(input.storedId)) {
    return input.storedId
  }
  return null
}

/** Pick a workspace to land on after login / `/` (D6). */
export function resolveLandingWorkspaceId(workspaces: Workspace[]): string | null {
  if (workspaces.length === 0) return null
  const stored = getLastWorkspaceId()
  if (stored && workspaces.some((w) => w.id === stored)) return stored
  const sorted = [...workspaces].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return sorted[0]?.id ?? null
}

/**
 * Active workspace for the shell (wordmark, switcher, settings link).
 * Route params / loaded entities win; `bf_last_workspace` is only a fallback
 * and is discarded when it no longer appears in the user's list.
 */
export function useActiveWorkspaceId(): string | null {
  const token = useAuthStore((s) => s.token)
  const params = useParams({ strict: false }) as {
    wsId?: string
    brandId?: string
    projectId?: string
  }

  // Skip network while logged out (login page mounts the same shell).
  const { data: workspaces } = useWorkspaces({ enabled: !!token })
  const { data: brand } = useBrand(params.brandId ?? '')
  const { data: project } = useProjectDetail(params.projectId ?? '')

  const routeWorkspaceId = params.wsId ?? brand?.workspaceId ?? project?.brand.workspaceId ?? null

  return resolveActiveWorkspaceId({
    routeWorkspaceId,
    storedId: getLastWorkspaceId(),
    workspaceIds: (workspaces ?? []).map((w) => w.id),
  })
}
