import type { BlobStore } from '@brandfactory/adapter-storage'
import type { Logger } from './logger'

// Canvas blocks reference blobs by key, but object storage sits outside the
// FK graph — deleting a brand or project cascades the rows and would leave
// the bytes behind forever. Callers collect the keys *before* the row delete
// (the cascade destroys the only pointer to them) and sweep after it lands.
//
// Best-effort by design: the rows are already gone and the user's delete has
// succeeded, so a storage failure must not turn into a 500 that implies
// nothing happened. Failures are logged for operators to reconcile.
export async function sweepBlobs(
  storage: BlobStore,
  keys: string[],
  log: Logger,
  context: { resource: 'brand' | 'project'; id: string },
): Promise<void> {
  if (keys.length === 0) return

  const results = await Promise.allSettled(keys.map((key) => storage.delete(key)))
  const failed = results.reduce((n, r) => (r.status === 'rejected' ? n + 1 : n), 0)

  if (failed > 0) {
    log.error('blob sweep incomplete — orphaned objects remain in storage', {
      resource: context.resource,
      id: context.id,
      total: keys.length,
      failed,
    })
  }
}
