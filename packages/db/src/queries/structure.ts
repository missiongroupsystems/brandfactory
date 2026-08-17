import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { brands } from '../schema/brands'
import { passportUnit } from '../schema/passport'
import { workspaces } from '../schema/workspaces'

/**
 * The join between BrandFactory's own structure and Mission Passport's.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 8b/8c.
 * Decision: proposal §8 `D1-b`.
 *
 * ---------------------------------------------------------------------------
 * Two structure models, one query, and NO mode switch
 * ---------------------------------------------------------------------------
 *
 * `D1-b` keeps `workspaces` and `brands` so that a person can create a brand while Passport
 * is unreachable and then work inside it. What it does **not** create is a "local mode" and
 * a "Passport mode": there is one query, and a row is linked or it is not. A deployment with
 * no Passport at all simply has every row unlinked, and every read below still answers.
 *
 * That is why there is no `structure` adapter port. The five existing ports each exist to
 * swap a vendor. Nothing here swaps.
 *
 * ---------------------------------------------------------------------------
 * `LEFT JOIN`, and it is load-bearing
 * ---------------------------------------------------------------------------
 *
 * An inner join returns nothing for a locally created brand, so every surface built on it
 * shows an empty page rather than an error — the brand exists, is usable, and is invisible.
 * That is the single most likely bug in this phase, which is why the join is written once,
 * here, and `packages/server/src/structure-read-guard.test.ts` sweeps for anybody reading
 * `passportUnit` for structure without going through this module.
 */

export interface BrandStructure {
  brandId: string
  workspaceId: string
  /** `brands.name` — the DISPLAY label. Always present, linked or not. */
  displayName: string
  /** The Passport unit, or null when Passport does not know this brand. */
  unitId: string | null
  /** The workspace's Passport organisation, or null. */
  organizationId: string | null
  /**
   * `passport.unit.name` — the LEGAL name, or null when unlinked.
   *
   * **Never defaulted to the display label.** A null legal name is the honest answer for a
   * brand Passport has never seen, and a surface that needs a legal name (statutory output,
   * a cross-app reference) must handle the null rather than print a label into it.
   */
  legalName: string | null
  /** Passport's status for the unit. Read through the link, never copied to `brands`. */
  unitStatus: string | null
  unitType: string | null
}

const selection = {
  brandId: brands.id,
  workspaceId: brands.workspaceId,
  displayName: brands.name,
  unitId: brands.passportUnitId,
  organizationId: workspaces.passportOrganizationId,
  legalName: passportUnit.name,
  unitStatus: passportUnit.status,
  unitType: passportUnit.type,
}

/** One brand's structure, linked or not. `undefined` only when the brand does not exist. */
export async function getBrandStructure(brandId: string): Promise<BrandStructure | undefined> {
  const [row] = await db
    .select(selection)
    .from(brands)
    .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
    // LEFT, so an unlinked brand still returns a row. See the header.
    .leftJoin(passportUnit, eq(passportUnit.id, brands.passportUnitId))
    .where(eq(brands.id, brandId))
    .limit(1)
  return row
}

/** Every brand in one workspace, linked or not, in creation order. */
export async function listBrandStructures(workspaceId: string): Promise<BrandStructure[]> {
  return db
    .select(selection)
    .from(brands)
    .innerJoin(workspaces, eq(workspaces.id, brands.workspaceId))
    .leftJoin(passportUnit, eq(passportUnit.id, brands.passportUnitId))
    .where(eq(brands.workspaceId, workspaceId))
    .orderBy(brands.createdAt)
}

/**
 * Link a local brand to the Passport unit it became.
 *
 * Called from the sync receiver on `unit.upserted` (plan 9c-bis), never from a route.
 *
 * ## Why this is not a projection write
 *
 * It writes `brands`, which is app-owned. `passport.unit` is untouched, so the projection
 * keeps exactly one writer and the read-only enforcement is unaffected. Do not be tempted to
 * "complete" the link by writing anything into `passport.*`.
 *
 * ## Idempotent, and deliberately NOT version-guarded
 *
 * The link is set once and never changes, so a replayed event finds the row already linked
 * and does nothing. It is not a projected field, so putting it behind the version guard
 * would be wrong twice over: it has no version of its own, and a lower-versioned replay
 * must still be able to complete a link that an earlier delivery failed to.
 *
 * ## `WHERE passport_unit_id IS NULL` is the guard that matters
 *
 * Without it a later event could repoint an already-linked brand at a different unit,
 * silently moving every guideline, thread and asset under it. With it, the first link wins
 * and a second attempt is a no-op that returns `false` — which the caller logs.
 *
 * Returns whether this call performed the link.
 */
export async function linkBrandToUnit(brandId: string, unitId: string): Promise<boolean> {
  const rows = await db
    .update(brands)
    .set({ passportUnitId: unitId })
    .where(and(eq(brands.id, brandId), isNull(brands.passportUnitId)))
    .returning({ id: brands.id })
  return rows.length > 0
}

/**
 * Read a local brand id out of a unit's `external_ref`.
 *
 * **Strict in what we send, liberal in what we accept.** The push always sends the bare
 * `brands.id` (see `packages/server/src/passport/structure-write.ts`). But an operator's
 * one-off import may have used the `brandfactory:<id>` form the original phase 8 specified,
 * and a unit imported that way must still link. Both are accepted; neither is guessed at.
 *
 * Anything else — another app's ref, or none — returns null, and the caller reports it
 * rather than dropping it silently.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function localBrandIdFromExternalRef(externalRef: string | null | undefined): string | null {
  if (!externalRef) return null
  const bare = externalRef.startsWith('brandfactory:')
    ? externalRef.slice('brandfactory:'.length)
    : externalRef
  return UUID.test(bare) ? bare.toLowerCase() : null
}

/**
 * How many brands in one workspace Passport does not know about.
 *
 * Surfaced beside the failed-write queue (plan 9e). **Not optional under `D1-b`**: a queue
 * nobody drains leaves a growing set of brands that exist here and nowhere else, invisible
 * to every sibling app, with nothing failing.
 */
export async function countUnlinkedBrands(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(brands)
    .where(and(eq(brands.workspaceId, workspaceId), isNull(brands.passportUnitId)))
  return row?.n ?? 0
}

/**
 * Units carrying a ref that matches no local brand.
 *
 * The other half of the link's failure mode (proposal `D1`): a unit whose `external_ref` is
 * absent or mismatched never links, leaving a local brand **and** an unlinked unit — two
 * records for one brand, with no error anywhere. Reported from reconciliation rather than
 * fixed automatically, because the repair is a human decision about which record is real.
 */
export async function listUnmatchedUnitRefs(
  organizationId: string,
): Promise<{ unitId: string; externalRef: string }[]> {
  const rows = await db
    .select({ unitId: passportUnit.id, externalRef: passportUnit.externalRef })
    .from(passportUnit)
    .where(
      and(
        eq(passportUnit.organizationId, organizationId),
        sql`${passportUnit.externalRef} is not null`,
        sql`not exists (select 1 from ${brands} b where b.passport_unit_id = ${passportUnit.id})`,
      ),
    )
  return rows.filter((r): r is { unitId: string; externalRef: string } => r.externalRef !== null)
}
