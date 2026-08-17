import type {
  BrandId,
  CreateOutletInput,
  Outlet,
  OutletId,
  UpdateOutletInput,
  WorkspaceId,
} from '@brandfactory/shared'
import { uniqueOutletSlug } from '@brandfactory/shared'
import { and, asc, eq, or } from 'drizzle-orm'
import { db } from '../client'
import { rowToOutlet } from '../mappers'
import { brands, outlets } from '../schema'

/**
 * A write named a `brandId` that is not in this outlet's workspace — either the
 * brand belongs to another workspace or it does not exist, and the two are
 * deliberately indistinguishable here: both are ids the caller's brand list never
 * showed it. The route turns this into a 400 `BRAND_NOT_IN_WORKSPACE`.
 *
 * The gate matters because `brand_id` has no workspace in it. Nothing in the
 * foreign key stops an outlet in workspace A pointing at a brand in workspace B,
 * and the outlets screen resolves that id against *its own* workspace's brands —
 * so the row would render with no brand name and no explanation.
 */
export class BrandNotInWorkspaceError extends Error {
  constructor(brandId: BrandId) {
    super(`Brand not in workspace: ${brandId}`)
    this.name = 'BrandNotInWorkspaceError'
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function assertBrandInWorkspace(
  tx: Tx,
  workspaceId: WorkspaceId,
  brandId: BrandId | null | undefined,
): Promise<void> {
  if (!brandId) return
  const rows = await tx
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.workspaceId, workspaceId)))
  if (rows.length === 0) throw new BrandNotInWorkspaceError(brandId)
}

/**
 * Every outlet in a workspace, in directory order (`name asc, id asc`).
 *
 * **Exhaustive, with no cursor and no filters**, which is the same shape
 * `listBrandSummariesByWorkspace` has and is a decision rather than an omission.
 * The screen above it groups by brand and counts each group; both need the whole
 * set, and a client that filtered a *page* would show "3 outlets" over a brand
 * that has nine. Filtering therefore happens in the client, over a list it holds
 * completely.
 *
 * That holds while an estate is tens of rows. The day it is thousands, this grows
 * a cursor and the filters move to SQL together — one without the other is the
 * "Zephyr alone on page one" failure `packages/web-next`'s AGENTS.md bans for
 * sorting.
 */
export async function listOutletsByWorkspace(workspaceId: WorkspaceId): Promise<Outlet[]> {
  const rows = await db
    .select()
    .from(outlets)
    .where(eq(outlets.workspaceId, workspaceId))
    .orderBy(asc(outlets.name), asc(outlets.id))
  return rows.map(rowToOutlet)
}

/**
 * One outlet by **slug or id** — `/outlets/casa-vostra` and `/outlets/<uuid>`
 * land on the same record.
 *
 * Scoped by workspace, which is what makes it safe to accept a slug at all: slugs
 * are unique per workspace, not globally. It is also the access gate — an id from
 * another workspace misses here rather than being read across the boundary
 * `requireWorkspaceAccess` just checked.
 *
 * The `ref` is compared against `slug` unconditionally and against `id` only when
 * it looks like a uuid. Handing Postgres a non-uuid string to compare with a
 * `uuid` column raises `invalid input syntax for type uuid` — a 500 for what is
 * really a 404.
 */
export async function getOutletByRef(
  workspaceId: WorkspaceId,
  ref: string,
): Promise<Outlet | null> {
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)
  const match = looksLikeUuid
    ? or(eq(outlets.slug, ref), eq(outlets.id, ref))
    : eq(outlets.slug, ref)
  const rows = await db
    .select()
    .from(outlets)
    .where(and(eq(outlets.workspaceId, workspaceId), match))
    .limit(1)
  return rows[0] ? rowToOutlet(rows[0]) : null
}

/**
 * Create one, deriving a free slug from the name.
 *
 * The slug is chosen inside the transaction, against the workspace's slugs read
 * in the same transaction — so two concurrent creates of the same name cannot
 * both settle on `casa-vostra`. Under Postgres' default READ COMMITTED they still
 * can, which is why `outlets_workspace_slug_key` exists: the loser takes a unique
 * violation instead of silently overwriting. That is a 500 on a genuinely rare
 * race, and the honest trade against serialising every create.
 */
export async function createOutlet(
  workspaceId: WorkspaceId,
  input: CreateOutletInput,
): Promise<Outlet> {
  return db.transaction(async (tx) => {
    await assertBrandInWorkspace(tx, workspaceId, input.brandId)

    const taken = await tx
      .select({ slug: outlets.slug })
      .from(outlets)
      .where(eq(outlets.workspaceId, workspaceId))

    const [row] = await tx
      .insert(outlets)
      .values({
        workspaceId,
        brandId: input.brandId ?? null,
        slug: uniqueOutletSlug(
          input.name,
          taken.map((r) => r.slug),
        ),
        name: input.name,
        outletType: input.outletType,
        // `.default('pipeline')` on the schema has already run, so the column
        // default is documentation rather than a second decision-maker.
        status: input.status,
        address: input.address ?? null,
        unit: input.unit ?? null,
        postalCode: input.postalCode ?? null,
        attributes: input.attributes ?? [],
        targetOpeningDate: input.targetOpeningDate ?? null,
        openingDate: input.openingDate ?? null,
        closingDate: input.closingDate ?? null,
        notes: input.notes ?? null,
      })
      .returning()
    return rowToOutlet(row!)
  })
}

/**
 * Patch one. Scoped by workspace as well as id, so an id from another workspace
 * misses rather than being written across the boundary.
 *
 * `undefined` leaves a key alone and `null` clears it — the distinction the whole
 * patch shape rests on, which is why every assignment below tests
 * `!== undefined` rather than truthiness. `attributes` is a full replacement.
 *
 * **`slug` is never touched.** It is frozen at create so a shared link survives a
 * rename; see `UpdateOutletInputSchema`.
 */
export async function updateOutlet(
  workspaceId: WorkspaceId,
  id: OutletId,
  patch: UpdateOutletInput,
): Promise<Outlet | null> {
  return db.transaction(async (tx) => {
    // Before the row lookup, so a bad brandId rejects the whole patch even when
    // the outlet itself would miss — the ordering `updateSocialPost` uses for its
    // asset gate, and for the same reason: a 400 about the body is more useful
    // than a 404 about the path when both are true.
    await assertBrandInWorkspace(tx, workspaceId, patch.brandId)

    const rows = await tx
      .update(outlets)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.outletType !== undefined ? { outletType: patch.outletType } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.brandId !== undefined ? { brandId: patch.brandId } : {}),
        ...(patch.address !== undefined ? { address: patch.address } : {}),
        ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
        ...(patch.postalCode !== undefined ? { postalCode: patch.postalCode } : {}),
        ...(patch.attributes !== undefined ? { attributes: patch.attributes } : {}),
        ...(patch.targetOpeningDate !== undefined
          ? { targetOpeningDate: patch.targetOpeningDate }
          : {}),
        ...(patch.openingDate !== undefined ? { openingDate: patch.openingDate } : {}),
        ...(patch.closingDate !== undefined ? { closingDate: patch.closingDate } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(outlets.id, id), eq(outlets.workspaceId, workspaceId)))
      .returning()
    return rows[0] ? rowToOutlet(rows[0]) : null
  })
}

/**
 * Hard delete, and deliberately not a soft one.
 *
 * Soft delete exists in this schema where a discarded thing is *recoverable
 * creative work* — an idea, an asset, a planned post (`docs/vision.md`'s
 * "discarded ideas aren't gone, just hidden"). A premises record is not that: an
 * outlet that closed is `status: 'closed'`, which is the state the product
 * already has for "no longer trading" and is the answer to almost every reason
 * somebody reaches for delete here. What is left is a row entered by mistake, and
 * a mistake is the one thing worth actually removing.
 *
 * Returns the row that went, or `null` when nothing matched — so the route 404s
 * on a second delete rather than reporting success twice. `deleteBrand` and
 * `deleteWorkspace` answer the same way, and the route hands the row back for the
 * same reason they do: it is the last copy anything will see.
 */
export async function deleteOutlet(workspaceId: WorkspaceId, id: OutletId): Promise<Outlet | null> {
  const rows = await db
    .delete(outlets)
    .where(and(eq(outlets.id, id), eq(outlets.workspaceId, workspaceId)))
    .returning()
  return rows[0] ? rowToOutlet(rows[0]) : null
}
