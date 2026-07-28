import { useParams } from '@tanstack/react-router'
import { useProjectDetail } from '@/api/queries/projects'

// Named `active-brand`, not `brand-context`: in this codebase "brand context"
// already means the brand's guidelines and its recorded conversation
// (`BrandContextBar`, `brand-context` threads). This module is only about
// *which brand the shell is currently inside*.

/**
 * Active brand for the shell switcher.
 *
 * Unlike `useActiveWorkspaceId` there is **no storage fallback**, and that
 * asymmetry is deliberate. The shell always needs *a* workspace — the wordmark
 * and the switcher point at one on every page — so a remembered id is better
 * than none. A brand is contextual: on workspace home you are not in a brand,
 * and a switcher that claimed one would offer to navigate away from the page
 * you are on to a brand you never picked.
 *
 * The project query is already mounted by `useActiveWorkspaceId` in the same
 * header, so React Query dedupes it — this costs no extra request.
 */
export function useActiveBrandId(): string | null {
  const params = useParams({ strict: false }) as {
    brandId?: string
    projectId?: string
  }
  const { data: project } = useProjectDetail(params.projectId ?? '')

  // The route param needs no query to resolve, so a brand page shows its
  // switcher on the first frame. Inside a project the brand is only known once
  // the project detail lands.
  return params.brandId ?? project?.brand.id ?? null
}
