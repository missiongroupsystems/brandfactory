import { useMutation } from '@tanstack/react-query'
import type {
  IdeateCopyInput,
  IdeateCopyResult,
  IdeateThemesInput,
  IdeateThemesResult,
} from '@brandfactory/shared'
import { api, callJson } from '@/api/client'

// ---------------------------------------------------------------------------
// The planner's two calls — mutations, and deliberately nothing else
// ---------------------------------------------------------------------------
//
// **No query key, no cache applier, no `useQuery`.** Every other module in this
// folder keeps a server resource coherent in the cache; there is no resource
// here. The route writes no row and stores no draft (`routes/social-ideate.ts`),
// so there is nothing for a second reader to go stale against.
//
// A `useQuery` would be actively wrong rather than merely unnecessary: React
// Query re-runs a stale query on window focus, and this one costs the workspace
// a model call every time. `useMutation` is the honest shape for *this happens
// because somebody pressed a button* — `useStartResearch`'s reason, for a call
// that is not even persisted.
//
// The ideas land in the panel's own state, and the commit writes them through
// `useCreateSocialPost`, which is the one writer this table has. That mutation
// patches the post list; nothing here has to.

/**
 * Pass 1 — a window of calendar in, post ideas out.
 *
 * `onError` is the caller's: the page owns every toast on this surface, and the
 * honest outcomes (`no-ideas`, `invalid-shape`) are not errors at all — they
 * arrive in the body and the panel has a line for each.
 */
export function useIdeateThemes(brandId: string) {
  return useMutation({
    mutationFn: async (input: IdeateThemesInput) => {
      const res = await api.brands[':id'].ideate.themes.$post({
        param: { id: brandId },
        json: input,
      })
      return callJson<IdeateThemesResult>(res)
    },
  })
}

/** Pass 2 — the accepted (idea × platform) pairs in, one caption each out. */
export function useIdeateCopy(brandId: string) {
  return useMutation({
    mutationFn: async (input: IdeateCopyInput) => {
      const res = await api.brands[':id'].ideate.copy.$post({
        param: { id: brandId },
        json: input,
      })
      return callJson<IdeateCopyResult>(res)
    },
  })
}
