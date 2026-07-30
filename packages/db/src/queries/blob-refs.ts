import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../client'
import { brandAssets, canvasBlocks } from '../schema'

/**
 * Which of these storage keys are **still referenced by a surviving row**.
 *
 * Added by the Stage 1–2 review, and it exists to make the sweep safe by
 * construction rather than by trusting where a key came from.
 *
 * `POST /brands/:id/assets` takes `blobKey` from the client and neither checks
 * that the key exists nor that the caller minted it — the transport was built
 * so the server stays out of the byte path, and the key it hands back is the
 * only token there is. That is tolerable for a *read* (holding a key already
 * grants one, via `GET /blob-urls/:key/read-url`). Stage 2 made it matter more
 * than that: a key stored on an asset row becomes a key the **brand cascade
 * deletes**, so a row pointing at bytes it does not own turns a delete of your
 * own brand into a delete of someone else's file.
 *
 * The keys embed a v4 UUID and workspaces are single-owner today, so this was
 * never reachable in practice. The fix is cheap and does not depend on either
 * of those staying true: **sweep only what nothing else points at.** Callers
 * collect their keys before the cascade, delete, then subtract whatever is
 * still referenced — by definition rows outside the resource just deleted.
 *
 * **Soft-deleted rows count as references.** A hidden asset or block can come
 * back (`docs/vision.md:51`), and destroying its bytes would make "hidden" mean
 * "gone" — the same rule `softDeleteAsset` is written around.
 */
export async function listStillReferencedBlobKeys(keys: string[]): Promise<string[]> {
  if (keys.length === 0) return []

  const blockRows = await db
    .select({ blobKey: canvasBlocks.blobKey })
    .from(canvasBlocks)
    .where(and(isNotNull(canvasBlocks.blobKey), inArray(canvasBlocks.blobKey, keys)))

  const assetRows = await db
    .select({ blobKey: brandAssets.blobKey })
    .from(brandAssets)
    .where(
      and(
        eq(brandAssets.source, 'blob'),
        isNotNull(brandAssets.blobKey),
        inArray(brandAssets.blobKey, keys),
      ),
    )

  return [
    ...new Set(
      [...blockRows, ...assetRows].map((r) => r.blobKey).filter((k): k is string => k !== null),
    ),
  ]
}
