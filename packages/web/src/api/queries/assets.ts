import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  BrandAsset,
  BrandAssetId,
  CreateBrandAssetInput,
  UpdateBrandAssetInput,
} from '@brandfactory/shared'
import { api, callJson } from '@/api/client'
import { useSignedReadUrl } from '@/api/queries/blobs'
import { brandKeys } from '@/api/queries/brands'
import { assetUrl } from '@/lib/asset-url'

/**
 * A brand's assets — colours, marks, photography, files.
 *
 * **`proposed` rows are included**, because filtering by status is the reader's
 * job and the readers disagree: the hub rail exists to show a brand
 * mid-decision, while `logoAsset` applies the active filter itself. The server
 * returns the list as stored for the same reason.
 *
 * **Rows are not resolved here.** A `blob` asset carries a `blobKey`, not a URL;
 * a signed read URL expires in five minutes and `useSignedReadUrl` owns that
 * refresh on a 4-minute interval. Resolution happens at the component that
 * renders the bytes (2D), not in this query.
 */
export function useBrandAssets(brandId: string) {
  return useQuery({
    queryKey: brandKeys.assets(brandId),
    enabled: !!brandId,
    queryFn: async () => {
      const res = await api.brands[':id'].assets.$get({ param: { id: brandId } })
      return callJson<BrandAsset[]>(res)
    },
  })
}

/**
 * The rendered URL of one asset, or `null`.
 *
 * This is `assetUrl` with the blob resolver actually wired up — which is why
 * neither half could live in `@brandfactory/shared`: a `blob` asset resolves
 * through a **signed read URL that expires in five minutes**, and
 * `useSignedReadUrl` refreshes it on a 4-minute interval for as long as the
 * image is mounted. A URL minted server-side, or once at render, is stale
 * before the page has been open a lunch break.
 *
 * `null` for a colour, which has no URL and never wanted one; `null` for a blob
 * whose read URL has not arrived yet, so the caller renders whatever it renders
 * when there is no asset at all — for `BrandMark`, the monogram, which is
 * already the loading placeholder.
 *
 * The hook is called unconditionally with a `null` key for non-blob sources,
 * because hooks cannot be called conditionally and because `useSignedReadUrl`
 * is already `enabled: !!blobKey`.
 */
export function useAssetUrl(asset: BrandAsset | null | undefined): string | null {
  const blobKey = asset?.source === 'blob' ? asset.blobKey : null
  const { data: signedUrl } = useSignedReadUrl(blobKey)
  if (!asset) return null
  return assetUrl(asset, () => signedUrl ?? '') || null
}

/**
 * Repoint the cached asset list after a write.
 *
 * There is only one cached copy — unlike guideline sections, which are embedded
 * in `ProjectDetail` as well as in `brands/:id` and so need the two-place patch
 * `applyGuidelinesToCache` performs. Assets are not part of any project payload,
 * and deliberately so: they are not in the agent's context, so nothing that
 * hydrates a thread carries them.
 *
 * Exported and standalone so the cache contract is testable without standing up
 * a mutation, the same shape as `applyGuidelinesToCache`.
 */
export function applyAssetToCache(
  queryClient: QueryClient,
  brandId: string,
  asset: BrandAsset,
): void {
  queryClient.setQueryData<BrandAsset[]>(brandKeys.assets(brandId), (old) => {
    if (!old) return old
    const index = old.findIndex((a) => a.id === asset.id)
    // A soft-deleted row leaves the list rather than sitting in it with a
    // `deletedAt` the renderers would each have to remember to filter. The
    // server's own read path drops it, so the cache agrees with a refetch.
    if (asset.deletedAt !== null) {
      return index === -1 ? old : [...old.slice(0, index), ...old.slice(index + 1)]
    }
    if (index === -1) return [...old, asset]
    return [...old.slice(0, index), asset, ...old.slice(index + 1)]
  })
}

export function useCreateAsset(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateBrandAssetInput) => {
      const res = await api.brands[':id'].assets.$post({ param: { id: brandId }, json: input })
      return callJson<BrandAsset>(res)
    },
    // Patched in rather than invalidated: the server appends by position, so
    // the returned row already carries the ordering decision and a refetch
    // would produce the same list one round trip later.
    onSuccess: (asset) => applyAssetToCache(queryClient, brandId, asset),
  })
}

export function useUpdateAsset(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: BrandAssetId; patch: UpdateBrandAssetInput }) => {
      const res = await api.brands[':id'].assets[':assetId'].$patch({
        param: { id: brandId, assetId: id },
        json: patch,
      })
      return callJson<BrandAsset>(res)
    },
    onSuccess: (asset) => applyAssetToCache(queryClient, brandId, asset),
  })
}

export function useDeleteAsset(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: BrandAssetId) => {
      const res = await api.brands[':id'].assets[':assetId'].$delete({
        param: { id: brandId, assetId: id },
      })
      return callJson<BrandAsset>(res)
    },
    // The response is the soft-deleted row, `deletedAt` set — which is exactly
    // what `applyAssetToCache` reads to drop it from the list.
    onSuccess: (asset) => applyAssetToCache(queryClient, brandId, asset),
  })
}

/**
 * Undo a delete. The row was never destroyed — a soft delete leaves the bytes
 * alone by design — so this is a state change, not a re-upload.
 *
 * 1.10.0 shipped delete with no confirmation and no way back, and said the fix
 * was an Undo rather than a dialog. This is the client half of that: the
 * restored row comes back with `deletedAt: null`, which `applyAssetToCache`
 * reads to put it back in the list at the position it never lost.
 */
export function useRestoreAsset(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: BrandAssetId) => {
      const res = await api.brands[':id'].assets[':assetId'].restore.$post({
        param: { id: brandId, assetId: id },
      })
      return callJson<BrandAsset>(res)
    },
    onSuccess: (asset) => applyAssetToCache(queryClient, brandId, asset),
  })
}

/**
 * Re-position a batch of assets in one transactional call.
 *
 * Replaces 2E's N-independent-`PATCH`es. Dragging one swatch renumbers every
 * row after it, so the old shape fired up to N concurrent writes whose
 * interleaving decided the final order and whose partial failure left the ramp
 * half-renumbered. The route returns the brand's full list, so the cache is
 * replaced outright rather than patched row by row — the server's ordering is
 * the answer, and there is no intermediate state worth rendering.
 */
export function useReorderAssets(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: Array<{ id: BrandAssetId; position: number }>) => {
      // `PATCH` on the collection rather than a `/reorder` verb — see the route,
      // where the spelling turned out to be load-bearing for Hono's router.
      const res = await api.brands[':id'].assets.$patch({
        param: { id: brandId },
        json: { updates },
      })
      return callJson<BrandAsset[]>(res)
    },
    onSuccess: (assets) => queryClient.setQueryData(brandKeys.assets(brandId), assets),
  })
}
