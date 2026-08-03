import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  CreateSocialPostInput,
  SocialPost,
  SocialPostId,
  UpdateSocialPostInput,
} from '@brandfactory/shared'
import { bySchedule } from '@brandfactory/shared'
import { api, callJson } from '@/api/client'
import { brandKeys } from '@/api/queries/brands'

/**
 * A brand's planned social posts, in calendar order — the unscheduled tray
 * first, then scheduled posts chronologically.
 *
 * **Attachments arrive as ids, not rows.** A post carries `assetIds`; the
 * calendar page already loads the brand's asset list (it needs the library
 * for the picker and `useSignedReadUrls` for thumbnails), so the join happens
 * at render through a `Map`. A second copy of asset rows in this cache would
 * be one `applyAssetToCache` could never reach — an asset renamed or restored
 * would go stale on every post that referenced it.
 *
 * Soft-deleted posts are absent, as they are from every read path.
 */
export function useBrandSocialPosts(brandId: string) {
  return useQuery({
    queryKey: brandKeys.socialPosts(brandId),
    enabled: !!brandId,
    queryFn: async () => {
      const res = await api.brands[':id']['social-posts'].$get({ param: { id: brandId } })
      return callJson<SocialPost[]>(res)
    },
  })
}

/**
 * Repoint the cached post list after a write.
 *
 * `applyAssetToCache`'s shape — insert-or-replace, drop when `deletedAt` —
 * **plus a re-sort**, which is the one way posts differ from assets. An asset
 * patch cannot change where the row belongs (position is patched explicitly,
 * and a reorder replaces the list outright), but a post patch routinely does:
 * moving a post to another day, or clearing its slot to send it back to the
 * tray, changes its place in an ordering the server computes. Splicing it in
 * where it used to be would leave the calendar showing a post under the wrong
 * date until something forced a refetch.
 *
 * `bySchedule` is the shared helper mirroring `listSocialPostsByBrand`'s SQL
 * (`scheduled_at asc nulls first, created_at asc`), so a re-sorted cache and
 * a refetch agree.
 *
 * Exported and standalone so the cache contract is testable without standing
 * up a mutation, the same shape as `applyAssetToCache`.
 */
export function applySocialPostToCache(
  queryClient: QueryClient,
  brandId: string,
  post: SocialPost,
): void {
  queryClient.setQueryData<SocialPost[]>(brandKeys.socialPosts(brandId), (old) => {
    if (!old) return old
    const index = old.findIndex((p) => p.id === post.id)
    // A soft-deleted row leaves the list rather than sitting in it with a
    // `deletedAt` the calendar and the list view would each have to filter.
    if (post.deletedAt !== null) {
      return index === -1 ? old : [...old.slice(0, index), ...old.slice(index + 1)]
    }
    const next =
      index === -1 ? [...old, post] : [...old.slice(0, index), post, ...old.slice(index + 1)]
    // Sort a copy — `next` is already fresh, but `toSorted` is not in this
    // target's lib and `sort` mutates in place.
    return [...next].sort(bySchedule)
  })
}

export function useCreateSocialPost(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateSocialPostInput) => {
      const res = await api.brands[':id']['social-posts'].$post({
        param: { id: brandId },
        json: input,
      })
      return callJson<SocialPost>(res)
    },
    // Patched in rather than invalidated: the server's row already carries
    // every default it filled in, and the applier's re-sort puts it where the
    // server's own ordering would.
    onSuccess: (post) => applySocialPostToCache(queryClient, brandId, post),
  })
}

export function useUpdateSocialPost(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: SocialPostId; patch: UpdateSocialPostInput }) => {
      const res = await api.brands[':id']['social-posts'][':postId'].$patch({
        param: { id: brandId, postId: id },
        json: patch,
      })
      return callJson<SocialPost>(res)
    },
    onSuccess: (post) => applySocialPostToCache(queryClient, brandId, post),
  })
}

export function useDeleteSocialPost(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: SocialPostId) => {
      const res = await api.brands[':id']['social-posts'][':postId'].$delete({
        param: { id: brandId, postId: id },
      })
      return callJson<SocialPost>(res)
    },
    // The response is the soft-deleted row, `deletedAt` set — which is exactly
    // what the applier reads to drop it from the list.
    onSuccess: (post) => applySocialPostToCache(queryClient, brandId, post),
  })
}

/**
 * Undo a delete. The row was never destroyed, and neither were its join rows,
 * so the restored post comes back with its attachments intact — which is what
 * lets the calendar offer an Undo toast instead of a confirmation dialog.
 */
export function useRestoreSocialPost(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: SocialPostId) => {
      const res = await api.brands[':id']['social-posts'][':postId'].restore.$post({
        param: { id: brandId, postId: id },
      })
      return callJson<SocialPost>(res)
    },
    onSuccess: (post) => applySocialPostToCache(queryClient, brandId, post),
  })
}
