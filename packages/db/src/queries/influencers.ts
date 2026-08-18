import type {
  BrandId,
  CreateInfluencerInput,
  Influencer,
  InfluencerId,
  UpdateInfluencerInput,
  WorkspaceId,
} from '@brandfactory/shared'
import { uniqueInfluencerSlug } from '@brandfactory/shared'
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { rowToInfluencer } from '../mappers'
import { influencerBrands, influencers } from '../schema'
import { assertBrandsInWorkspace } from './brand-scope'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * A write named a `(platform, handle)` pair this workspace already holds.
 *
 * **The one refusal on this aggregate that only the database can make.** Every
 * other rule here is a zod schema or a `SELECT` the query layer runs first;
 * this one is a unique index, because the question is "does another row already
 * say this" and no amount of reading before the write settles it. So it arrives
 * as an exception rather than as a return value, and the route turns it into a
 * 409.
 *
 * It exists because **`influencers` is the first aggregate in this schema with a
 * user-typed unique key.** An outlet's only unique key is its slug, and
 * `uniqueOutletSlug` always picks a free one — so no outlet form can trip a
 * constraint and none of them had to. A creator's handle is typed into a box,
 * and the most ordinary mistake on that box is entering somebody who is already
 * on the roster.
 */
export class InfluencerHandleTakenError extends Error {
  readonly handle: string
  readonly platform: string
  constructor(handle: string, platform: string) {
    super(`Handle already on this platform: @${handle} on ${platform}`)
    this.name = 'InfluencerHandleTakenError'
    this.handle = handle
    this.platform = platform
  }
}

/**
 * Postgres `23505 unique_violation`, narrowed to the one index that means "this
 * creator is already on the roster for that platform".
 *
 * **Checked by constraint name, not by code alone**, for the reason
 * `isInFlightUniqueViolation` states one aggregate over: any *other* unique
 * violation reaching this line is a bug, and answering it with a friendly
 * message about a duplicate handle would hide it.
 *
 * `influencers_workspace_slug_key` is deliberately **not** matched here. That
 * one is the create race `createInfluencer` documents — two concurrent creates
 * of one handle both settling on the same free slug — and it is a different
 * fact: nothing is taken, two writers collided, and a retry succeeds. Reporting
 * it as "handle already used" would tell the first honest thing that came to
 * hand rather than the true one. It keeps its 500 and its docstring.
 *
 * `pg` puts both fields on the error and neither is typed, so this reads them
 * defensively rather than importing a driver type into the query layer.
 */
function isHandleUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const pgError = err as { code?: unknown; constraint?: unknown }
  return (
    pgError.code === '23505' && pgError.constraint === 'influencers_workspace_platform_handle_key'
  )
}

/**
 * Full replacement of a creator's brand links — delete, then insert.
 *
 * Add and remove are one verb, which is what keeps the join table an
 * implementation detail of this module. The wire sends the whole set because the
 * client holds the whole set, so there is no merge for two writers to disagree
 * about.
 *
 * The ids are **sorted before insert** for the same reason the reads sort: the
 * response's `brandIds` is byte-identical across two reads of one row, so a diff
 * of the row is never noise.
 */
async function replaceInfluencerBrands(
  tx: Tx,
  influencerId: InfluencerId,
  brandIds: BrandId[],
): Promise<BrandId[]> {
  await tx.delete(influencerBrands).where(eq(influencerBrands.influencerId, influencerId))
  const sorted = [...brandIds].sort((a, b) => a.localeCompare(b))
  if (sorted.length > 0) {
    await tx.insert(influencerBrands).values(sorted.map((brandId) => ({ influencerId, brandId })))
  }
  return sorted
}

/** One creator's brand ids, sorted. Used by the reads that hold a single row. */
async function brandIdsForInfluencer(
  dbOrTx: Tx | typeof db,
  influencerId: string,
): Promise<BrandId[]> {
  const joins = await dbOrTx
    .select({ brandId: influencerBrands.brandId })
    .from(influencerBrands)
    .where(eq(influencerBrands.influencerId, influencerId))
    .orderBy(asc(influencerBrands.brandId))
  return joins.map((j) => j.brandId as BrandId)
}

/**
 * Every creator in a workspace, biggest reach first
 * (`followers desc, name asc, id asc`) — the ordering `byInfluencerReach` mirrors.
 *
 * **Exhaustive, with no cursor and no filters**, the same call
 * `listOutletsByWorkspace` makes, and it pays off harder here: the screen carries
 * **counts on its group headers**, so a client filtering a *page* would render
 * "3 in Micro" over a tier that holds nine. The four panel filters and the search
 * box narrow an array the client holds completely.
 *
 * That holds while a roster is tens of rows. Past roughly 150, the keyset cursor
 * on `(followers desc, name, id)` and the SQL filters land **together** — one
 * without the other is the "Zephyr alone on page one" failure `packages/web-next`'s
 * AGENTS.md bans.
 *
 * **Two queries and an in-memory map, not a `json_agg`.** The set is exhaustive and
 * small, and an array-shaped column would have to be unpacked differently here than
 * on the detail read — which is a second mapper for one wire shape. Same shape
 * `listSocialPostsByBrand` uses for its attachments.
 */
export async function listInfluencersByWorkspace(workspaceId: WorkspaceId): Promise<Influencer[]> {
  const rows = await db
    .select()
    .from(influencers)
    .where(eq(influencers.workspaceId, workspaceId))
    .orderBy(desc(influencers.followers), asc(influencers.name), asc(influencers.id))
  if (rows.length === 0) return []

  const joins = await db
    .select()
    .from(influencerBrands)
    .where(
      inArray(
        influencerBrands.influencerId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(influencerBrands.influencerId), asc(influencerBrands.brandId))
  const byInfluencer = new Map<string, BrandId[]>()
  for (const join of joins) {
    const list = byInfluencer.get(join.influencerId) ?? []
    list.push(join.brandId as BrandId)
    byInfluencer.set(join.influencerId, list)
  }
  return rows.map((row) => rowToInfluencer(row, byInfluencer.get(row.id) ?? []))
}

/**
 * One creator by **slug or id** — `/influencers/priyaskin` and
 * `/influencers/<uuid>` land on the same record.
 *
 * Scoped by workspace, which is what makes it safe to accept a slug at all: slugs
 * are unique per workspace, not globally. It is also the access gate — an id from
 * another workspace misses here rather than being read across the boundary
 * `requireWorkspaceAccess` just checked.
 *
 * The `ref` is compared against `slug` unconditionally and against `id` only when
 * it looks like a uuid. Handing Postgres a non-uuid string to compare with a `uuid`
 * column raises `invalid input syntax for type uuid` — a 500 for what is really a
 * 404. `getOutletByRef` carries the same branch for the same reason.
 */
export async function getInfluencerByRef(
  workspaceId: WorkspaceId,
  ref: string,
): Promise<Influencer | null> {
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)
  const match = looksLikeUuid
    ? or(eq(influencers.slug, ref), eq(influencers.id, ref))
    : eq(influencers.slug, ref)
  const rows = await db
    .select()
    .from(influencers)
    .where(and(eq(influencers.workspaceId, workspaceId), match))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return rowToInfluencer(row, await brandIdsForInfluencer(db, row.id))
}

/**
 * Create one, deriving a free slug from the handle.
 *
 * One transaction: the brand gate, the row, the link rows — a brand from another
 * workspace rolls back the lot rather than leaving a creator with half their
 * brands.
 *
 * The slug is chosen inside the transaction, against the workspace's slugs read in
 * the same transaction — so two concurrent creates of the same handle cannot both
 * settle on `priyaskin`. Under Postgres' default READ COMMITTED they still can,
 * which is why `influencers_workspace_slug_key` exists: the loser takes a unique
 * violation instead of silently overwriting. That is a 500 on a genuinely rare
 * race, and the honest trade against serialising every create.
 *
 * `influencers_workspace_platform_handle_key` is the second violation this can
 * take, and it is not a race — it is the same creator entered twice on one
 * platform, which is a duplicate rather than a second row. **That one is caught**
 * and becomes `InfluencerHandleTakenError`, which the route answers with a 409:
 * it is the most ordinary mistake the create form can make, and a person who has
 * just typed a handle is owed the reason rather than an internal error.
 */
export async function createInfluencer(
  workspaceId: WorkspaceId,
  input: CreateInfluencerInput,
): Promise<Influencer> {
  const brandIds = input.brandIds ?? []
  return db.transaction(async (tx) => {
    await assertBrandsInWorkspace(tx, workspaceId, brandIds)

    const taken = await tx
      .select({ slug: influencers.slug })
      .from(influencers)
      .where(eq(influencers.workspaceId, workspaceId))

    const inserted = await tx
      .insert(influencers)
      .values({
        workspaceId,
        slug: uniqueInfluencerSlug(
          input.handle,
          taken.map((r) => r.slug),
        ),
        name: input.name,
        handle: input.handle,
        platform: input.platform,
        followers: input.followers,
        // `numeric` takes a string on the way in as well as handing one back.
        // `String(3.8)` is `'3.8'`, which Postgres rounds to the column's scale.
        engagementRate:
          input.engagementRate === undefined || input.engagementRate === null
            ? null
            : String(input.engagementRate),
        vertical: input.vertical ?? null,
        // `.default('prospect')` on the schema has already run, so the column
        // default is documentation rather than a second decision-maker.
        status: input.status,
        notes: input.notes ?? null,
      })
      .returning()
      .catch((err: unknown) => {
        // Inside the transaction, so the throw rolls back the brand gate's read
        // and any link row with it. Nothing half-written survives a duplicate.
        if (isHandleUniqueViolation(err)) {
          throw new InfluencerHandleTakenError(input.handle, input.platform)
        }
        throw err
      })
    const [row] = inserted
    if (!row) throw new Error('createInfluencer returned no row')
    const linked = await replaceInfluencerBrands(tx, row.id as InfluencerId, brandIds)
    return rowToInfluencer(row, linked)
  })
}

/**
 * Patch one. Scoped by workspace as well as id, so an id from another workspace
 * misses rather than being written across the boundary.
 *
 * `undefined` leaves a key alone and `null` clears it — the distinction the whole
 * patch shape rests on, which is why every assignment below tests `!== undefined`
 * rather than truthiness. `brandIds` is a full replacement.
 *
 * **`slug` is never touched.** It is frozen at create so a shared link survives a
 * corrected handle; see `UpdateInfluencerInputSchema`.
 *
 * A patch that moves `handle` or `platform` can land on a pair the workspace
 * already holds, exactly as a create can, and it becomes the same
 * `InfluencerHandleTakenError`. Correcting a typo into somebody else's handle is
 * the same mistake as entering them twice, and it is owed the same answer.
 */
export async function updateInfluencer(
  workspaceId: WorkspaceId,
  id: InfluencerId,
  patch: UpdateInfluencerInput,
): Promise<Influencer | null> {
  return db.transaction(async (tx) => {
    // Before the row lookup, so a bad brandId rejects the whole patch even when
    // the creator itself would miss — the ordering `updateOutlet` and
    // `updateSocialPost` both use, and for the same reason: a 400 about the body is
    // more useful than a 404 about the path when both are true.
    if (patch.brandIds !== undefined) {
      await assertBrandsInWorkspace(tx, workspaceId, patch.brandIds)
    }

    // Only when the patch can actually collide, which is why this is not an
    // unconditional read: the unique key is `(workspace_id, platform, handle)`,
    // so a patch touching neither cannot trip it. It exists so the error can name
    // the *pair* that clashed — a patch may move one half and leave the other, and
    // a failed transaction cannot be read from afterwards.
    const movesKey = patch.handle !== undefined || patch.platform !== undefined
    const [before] = movesKey
      ? await tx
          .select({ handle: influencers.handle, platform: influencers.platform })
          .from(influencers)
          .where(and(eq(influencers.id, id), eq(influencers.workspaceId, workspaceId)))
          .limit(1)
      : []

    const [row] = await tx
      .update(influencers)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.handle !== undefined ? { handle: patch.handle } : {}),
        ...(patch.platform !== undefined ? { platform: patch.platform } : {}),
        ...(patch.followers !== undefined ? { followers: patch.followers } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.engagementRate !== undefined
          ? {
              engagementRate: patch.engagementRate === null ? null : String(patch.engagementRate),
            }
          : {}),
        ...(patch.vertical !== undefined ? { vertical: patch.vertical } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(influencers.id, id), eq(influencers.workspaceId, workspaceId)))
      .returning()
      .catch((err: unknown) => {
        if (isHandleUniqueViolation(err)) {
          throw new InfluencerHandleTakenError(
            patch.handle ?? before?.handle ?? '',
            patch.platform ?? before?.platform ?? '',
          )
        }
        throw err
      })
    if (!row) return null
    if (patch.brandIds !== undefined) {
      return rowToInfluencer(row, await replaceInfluencerBrands(tx, id, patch.brandIds))
    }
    return rowToInfluencer(row, await brandIdsForInfluencer(tx, id))
  })
}

/**
 * Hard delete, and deliberately not a soft one — `deleteOutlet`'s call.
 *
 * Soft delete exists in this schema where a discarded thing is *recoverable
 * creative work*: an idea, an asset, a planned post. A creator is not that. Someone
 * you stopped working with is `status: 'past'`, which is the state this record
 * already has for it and is the answer to almost every reason somebody reaches for
 * delete here. What is left is a row entered by mistake, and a mistake is the one
 * thing worth actually removing.
 *
 * The link rows go with it, by cascade. Returns the row that went, or `null` when
 * nothing matched — so the route 404s on a second delete rather than reporting
 * success twice.
 *
 * **The brand ids are read before the delete**, because after it there is nothing
 * to read them from. The route hands the row back as the last copy anything will
 * see, so it has to be the whole record.
 */
export async function deleteInfluencer(
  workspaceId: WorkspaceId,
  id: InfluencerId,
): Promise<Influencer | null> {
  return db.transaction(async (tx) => {
    const brandIds = await brandIdsForInfluencer(tx, id)
    const [row] = await tx
      .delete(influencers)
      .where(and(eq(influencers.id, id), eq(influencers.workspaceId, workspaceId)))
      .returning()
    return row ? rowToInfluencer(row, brandIds) : null
  })
}
