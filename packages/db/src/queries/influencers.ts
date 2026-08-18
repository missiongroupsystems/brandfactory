import type {
  BrandId,
  CreateInfluencerInput,
  Influencer,
  InfluencerAccount,
  InfluencerId,
  UpdateInfluencerInput,
  WorkspaceId,
} from '@brandfactory/shared'
import { byInfluencerReach, uniqueInfluencerSlug } from '@brandfactory/shared'
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { rowToInfluencer, rowToInfluencerAccount } from '../mappers'
import { influencerAccounts, influencerBrands, influencers } from '../schema'
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
  /**
   * The creator who already holds the pair, and **which** pair it was — or `null`
   * when no read could tell.
   *
   * **One nullable object rather than three nullable fields, and that shape is the
   * fix.** All three facts come from the same pre-flight `SELECT`, so they are
   * known together or not at all. They used to be three arguments with the name
   * defaulting to `null`, and the two call sites filled the gap with
   * `accounts[0]` — which is right only when the creator has one account. A
   * concurrent writer taking the violation on account three then produced a
   * sentence naming account one, so the message pointed at a handle that was
   * never in conflict and the reader would have "fixed" the wrong row.
   *
   * **Best-effort, and the constraint is still the correctness boundary.** The
   * `catch` on every write is what actually refuses the duplicate; this object
   * only decides how well the refusal can be worded. When it is `null` the route
   * says so plainly instead of guessing — see `rethrowWriteConflict`.
   *
   * It became possible to name a holder at all because the conflict is now with
   * another *person's* account rather than with a bare row.
   */
  readonly holder: { name: string; handle: string; platform: string } | null
  constructor(holder: { name: string; handle: string; platform: string } | null) {
    super(
      holder
        ? `Handle already on this platform: @${holder.handle} on ${holder.platform}`
        : 'An account in this write is already held in this workspace',
    )
    this.name = 'InfluencerHandleTakenError'
    this.holder = holder
  }
}

/**
 * Postgres `23505 unique_violation`, narrowed to the one index that means "this
 * account is already on somebody's record in this workspace".
 *
 * The constraint moved to `influencer_accounts` in migration 0016 with the two
 * columns it names. The name matched here moved with it; nothing else about this
 * check changed.
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
    pgError.code === '23505' &&
    pgError.constraint === 'influencer_accounts_workspace_platform_handle_key'
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

/**
 * Full replacement of a creator's accounts — delete, then insert with dense
 * positions. `replaceVendorContacts` is the function this is a copy of.
 *
 * Add, remove and reorder are one verb, which is what keeps the child table an
 * implementation detail of this module. The wire sends the whole list because the
 * client holds the whole list, so there is no merge for two writers to disagree
 * about.
 *
 * **The order is not touched.** `position` is the array index, and index 0 is the
 * account the creator is known by — so re-sorting here would silently rename the
 * person on every screen.
 *
 * `workspaceId` is a parameter rather than a read of `input`, and the callers
 * take it from the **parent row** they just wrote. It is the one denormalised
 * column in this aggregate and this is the only function that writes it; a
 * caller's own idea of the workspace would be a second source for a value the
 * unique key depends on.
 */
async function replaceInfluencerAccounts(
  tx: Tx,
  influencerId: InfluencerId,
  workspaceId: WorkspaceId,
  accounts: InfluencerAccount[],
): Promise<InfluencerAccount[]> {
  await tx.delete(influencerAccounts).where(eq(influencerAccounts.influencerId, influencerId))
  if (accounts.length === 0) return []
  const written = await tx
    .insert(influencerAccounts)
    .values(
      accounts.map((account, position) => ({
        influencerId,
        workspaceId,
        position,
        platform: account.platform,
        handle: account.handle,
        followers: account.followers,
        // `numeric` takes a string on the way in as well as handing one back.
        // `String(3.8)` is `'3.8'`, which Postgres rounds to the column's scale.
        engagementRate: account.engagementRate === null ? null : String(account.engagementRate),
        url: account.url,
      })),
    )
    .returning()
  // **The written rows, not the submitted ones.** `numeric(5,2)` rounds `3.456`
  // to `3.46` on write, and a response echoing the body would hand back a figure
  // the table does not hold — which the next read then contradicts.
  // `replaceVendorContacts` can echo its argument because a contact is five text
  // columns; this one cannot.
  return [...written].sort((a, b) => a.position - b.position).map(rowToInfluencerAccount)
}

/** One creator's accounts, in position order. Used by the reads that hold a single row. */
async function accountsForInfluencer(
  dbOrTx: Tx | typeof db,
  influencerId: string,
): Promise<InfluencerAccount[]> {
  const rows = await dbOrTx
    .select()
    .from(influencerAccounts)
    .where(eq(influencerAccounts.influencerId, influencerId))
    .orderBy(asc(influencerAccounts.position))
  return rows.map(rowToInfluencerAccount)
}

/**
 * The name of the creator who already holds one of these `(platform, handle)`
 * pairs, or `null` when nobody does.
 *
 * **Read before the write, for the message and only for the message.** The unique
 * index is still the correctness boundary — this `SELECT` and the insert are not
 * atomic against a concurrent writer, and the `catch` on every write is what
 * actually refuses the duplicate. What the read buys is the sentence: the pair now
 * collides with another *person's* account, and "already on Priya Raman's record"
 * tells somebody what to do next where "handle already used" leaves them guessing.
 *
 * `exclude` is the creator being patched. Their own accounts are the ones being
 * replaced, so a pair they already hold is not a conflict — without this, editing
 * a creator's notes with their accounts resubmitted would report a clash with
 * themselves.
 */
async function findAccountHolder(
  tx: Tx,
  workspaceId: WorkspaceId,
  accounts: InfluencerAccount[],
  exclude: InfluencerId | null,
): Promise<{ name: string; handle: string; platform: string } | null> {
  if (accounts.length === 0) return null
  const rows = await tx
    .select({
      name: influencers.name,
      handle: influencerAccounts.handle,
      platform: influencerAccounts.platform,
      influencerId: influencerAccounts.influencerId,
    })
    .from(influencerAccounts)
    .innerJoin(influencers, eq(influencers.id, influencerAccounts.influencerId))
    .where(
      and(
        eq(influencerAccounts.workspaceId, workspaceId),
        or(
          ...accounts.map((account) =>
            and(
              eq(influencerAccounts.platform, account.platform),
              eq(influencerAccounts.handle, account.handle),
            ),
          ),
        ),
      ),
    )
  const clash = rows.find((row) => row.influencerId !== exclude)
  return clash ? { name: clash.name, handle: clash.handle, platform: clash.platform } : null
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
 * Every creator in a workspace, biggest reach first — the ordering
 * `byInfluencerReach` defines.
 *
 * **Sorted in JavaScript, not by an `ORDER BY`.** Reach is a sum over
 * `influencer_accounts` now, which SQL reaches only through a join and a
 * `GROUP BY`, and `influencers_workspace_followers_idx` went in migration 0016
 * with the column it indexed. The sort runs over the same array this function was
 * already returning whole, so it costs the assembly and nothing more.
 *
 * **Exhaustive, with no cursor and no filters**, the same call
 * `listOutletsByWorkspace` makes, and it pays off harder here: the screen carries
 * **counts on its group headers**, so a client filtering a *page* would render
 * "3 in Micro" over a tier that holds nine. The four panel filters and the search
 * box narrow an array the client holds completely.
 *
 * That holds while a roster is tens of rows. **The in-memory sort moves that
 * tripwire nearer without crossing it**: past roughly 150 rows, the keyset cursor
 * and the SQL filters land **together** — one without the other is the "Zephyr
 * alone on page one" failure `packages/web-next`'s AGENTS.md bans. A keyset cursor
 * on a derived sum is the harder half of that work, and it is the price of this
 * shape.
 *
 * **Three queries and two in-memory maps, not a `json_agg`.** The set is
 * exhaustive and small, and array-shaped columns would have to be unpacked
 * differently here than on the detail read — which is a second mapper for one wire
 * shape. `listVendorsByWorkspace` assembles its two relations the same way.
 */
export async function listInfluencersByWorkspace(workspaceId: WorkspaceId): Promise<Influencer[]> {
  const rows = await db.select().from(influencers).where(eq(influencers.workspaceId, workspaceId))
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  const joins = await db
    .select()
    .from(influencerBrands)
    .where(inArray(influencerBrands.influencerId, ids))
    .orderBy(asc(influencerBrands.influencerId), asc(influencerBrands.brandId))
  const brandsByInfluencer = new Map<string, BrandId[]>()
  for (const join of joins) {
    const list = brandsByInfluencer.get(join.influencerId) ?? []
    list.push(join.brandId as BrandId)
    brandsByInfluencer.set(join.influencerId, list)
  }

  const accountRows = await db
    .select()
    .from(influencerAccounts)
    .where(inArray(influencerAccounts.influencerId, ids))
    .orderBy(asc(influencerAccounts.influencerId), asc(influencerAccounts.position))
  const accountsByInfluencer = new Map<string, InfluencerAccount[]>()
  for (const row of accountRows) {
    const list = accountsByInfluencer.get(row.influencerId) ?? []
    list.push(rowToInfluencerAccount(row))
    accountsByInfluencer.set(row.influencerId, list)
  }

  return rows
    .map((row) =>
      rowToInfluencer(
        row,
        brandsByInfluencer.get(row.id) ?? [],
        accountsByInfluencer.get(row.id) ?? [],
      ),
    )
    .sort(byInfluencerReach)
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
  return rowToInfluencer(
    row,
    await brandIdsForInfluencer(db, row.id),
    await accountsForInfluencer(db, row.id),
  )
}

/**
 * Create one, deriving a free slug from the **name**.
 *
 * One transaction: the brand gate, the row, the link rows, the account rows — a
 * brand from another workspace rolls back the lot rather than leaving a creator
 * with half their brands and none of their accounts.
 *
 * The slug is chosen inside the transaction, against the workspace's slugs read in
 * the same transaction — so two concurrent creates of the same name cannot both
 * settle on `priya-raman`. Under Postgres' default READ COMMITTED they still can,
 * which is why `influencers_workspace_slug_key` exists: the loser takes a unique
 * violation instead of silently overwriting. That is a 500 on a genuinely rare
 * race, and the honest trade against serialising every create.
 *
 * `influencer_accounts_workspace_platform_handle_key` is the second violation this
 * can take, and it is not a race — it is a creator already on the roster, entered
 * again. **That one is caught** and becomes `InfluencerHandleTakenError`, which
 * the route answers with a 409: it is the most ordinary mistake the create form
 * can make, and a person who has just typed a handle is owed the reason rather
 * than an internal error.
 *
 * The holder is read **before** the accounts are written, because a failed
 * transaction cannot be read from afterwards and the name is the whole point of
 * the message.
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

    const holder = await findAccountHolder(tx, workspaceId, input.accounts, null)

    const inserted = await tx
      .insert(influencers)
      .values({
        workspaceId,
        slug: uniqueInfluencerSlug(
          input.name,
          taken.map((r) => r.slug),
        ),
        name: input.name,
        vertical: input.vertical ?? null,
        // `.default('prospect')` on the schema has already run, so the column
        // default is documentation rather than a second decision-maker.
        status: input.status,
        notes: input.notes ?? null,
      })
      .returning()
    const [row] = inserted
    if (!row) throw new Error('createInfluencer returned no row')

    const linked = await replaceInfluencerBrands(tx, row.id as InfluencerId, brandIds)
    const accounts = await replaceInfluencerAccounts(
      tx,
      row.id as InfluencerId,
      row.workspaceId as WorkspaceId,
      input.accounts,
    ).catch((err: unknown) => {
      // Inside the transaction, so the throw rolls back the parent row and its
      // link rows with it. Nothing half-written survives a duplicate.
      // `holder` is whatever the pre-flight read saw, and `null` when it saw
      // nothing — which is a concurrent writer, or a body repeating a pair
      // against itself past zod. Neither case knows which of the submitted
      // accounts collided, so neither one guesses.
      if (isHandleUniqueViolation(err)) throw new InfluencerHandleTakenError(holder)
      throw err
    })
    return rowToInfluencer(row, linked, accounts)
  })
}

/**
 * Patch one. Scoped by workspace as well as id, so an id from another workspace
 * misses rather than being written across the boundary.
 *
 * `undefined` leaves a key alone and `null` clears it — the distinction the whole
 * patch shape rests on, which is why every assignment below tests `!== undefined`
 * rather than truthiness. `brandIds` and `accounts` are both full replacements.
 *
 * **`slug` is never touched.** It is frozen at create so a shared link survives a
 * corrected name; see `UpdateInfluencerInputSchema`.
 *
 * **An omitted `accounts` leaves every account alone**, which is what makes a
 * patch of `notes` alone safe: the delete-then-insert never runs. A submitted
 * list replaces the lot, positions included, so reordering the rows in the form
 * is a patch like any other.
 *
 * A submitted account can land on a pair another creator already holds, exactly
 * as a create can, and it becomes the same `InfluencerHandleTakenError` naming
 * that creator. Correcting a typo into somebody else's handle is the same mistake
 * as entering them twice, and it is owed the same answer.
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
    // unconditional read: the unique key is on the account rows, so a patch that
    // sends no accounts cannot trip it. It excludes this creator's own accounts —
    // resubmitting a list unchanged is not a conflict with itself.
    const holder =
      patch.accounts !== undefined
        ? await findAccountHolder(tx, workspaceId, patch.accounts, id)
        : null

    const [row] = await tx
      .update(influencers)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.vertical !== undefined ? { vertical: patch.vertical } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(influencers.id, id), eq(influencers.workspaceId, workspaceId)))
      .returning()
    if (!row) return null

    const accounts =
      patch.accounts !== undefined
        ? await replaceInfluencerAccounts(
            tx,
            id,
            row.workspaceId as WorkspaceId,
            patch.accounts,
          ).catch((err: unknown) => {
            if (isHandleUniqueViolation(err)) throw new InfluencerHandleTakenError(holder)
            throw err
          })
        : await accountsForInfluencer(tx, id)

    const brandIds =
      patch.brandIds !== undefined
        ? await replaceInfluencerBrands(tx, id, patch.brandIds)
        : await brandIdsForInfluencer(tx, id)

    return rowToInfluencer(row, brandIds, accounts)
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
 * **The brand ids and the accounts are both read before the delete**, because
 * after it there is nothing to read them from — the cascade takes the account rows
 * with the creator. The route hands the row back as the last copy anything will
 * see, so it has to be the whole record.
 */
export async function deleteInfluencer(
  workspaceId: WorkspaceId,
  id: InfluencerId,
): Promise<Influencer | null> {
  return db.transaction(async (tx) => {
    const brandIds = await brandIdsForInfluencer(tx, id)
    const accounts = await accountsForInfluencer(tx, id)
    const [row] = await tx
      .delete(influencers)
      .where(and(eq(influencers.id, id), eq(influencers.workspaceId, workspaceId)))
      .returning()
    return row ? rowToInfluencer(row, brandIds, accounts) : null
  })
}
