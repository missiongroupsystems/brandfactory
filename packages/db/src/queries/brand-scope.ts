import type { BrandId, WorkspaceId } from '@brandfactory/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { db } from '../client'
import { brands } from '../schema'
import { BrandNotInWorkspaceError } from './outlets'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The workspace gate on a set of brand ids, and the array-taking sibling of
 * `assertBrandInWorkspace` in `queries/outlets.ts`.
 *
 * It was written for `influencer_brands` and lives here rather than in
 * `queries/influencers.ts` because `vendor_brands` needs exactly the same gate.
 * **Nothing about it changed in the move** — same query, same error, same first-
 * miss behaviour — and moving it is what stopped a second copy existing, which is
 * the thing that would drift.
 *
 * **It reuses `BrandNotInWorkspaceError` unchanged**, and it names the *first*
 * missing id rather than all of them. The error carries one id because an outlet
 * only ever has one, and a route that reported `["a","b"]` for one aggregate and
 * `"a"` for another would be two error shapes for one condition. The first miss is
 * enough to fix the body.
 *
 * The check runs inside the caller's transaction so it and the link-row insert see
 * the same snapshot. It is not the foreign key's job: nothing in a join table's
 * key stops a record in workspace A being linked to a brand in workspace B, and
 * the screen resolves those ids against *its own* workspace's brands — so the row
 * would render an unresolvable id with no explanation.
 */
export async function assertBrandsInWorkspace(
  tx: Tx,
  workspaceId: WorkspaceId,
  brandIds: BrandId[],
): Promise<void> {
  if (brandIds.length === 0) return
  const rows = await tx
    .select({ id: brands.id })
    .from(brands)
    .where(and(inArray(brands.id, brandIds), eq(brands.workspaceId, workspaceId)))
  const owned = new Set<string>(rows.map((r) => r.id))
  const missing = brandIds.find((id) => !owned.has(id))
  if (missing !== undefined) throw new BrandNotInWorkspaceError(missing)
}
