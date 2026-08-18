import type {
  BrandId,
  CreateVendorInput,
  UpdateVendorInput,
  Vendor,
  VendorContact,
  VendorId,
  WorkspaceId,
} from '@brandfactory/shared'
import { uniqueVendorSlug } from '@brandfactory/shared'
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { rowToVendor, rowToVendorContact } from '../mappers'
import { vendorBrands, vendorContacts, vendors } from '../schema'
import { assertBrandsInWorkspace } from './brand-scope'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * A write named a UEN this workspace already holds.
 *
 * **The one refusal on this aggregate that only the database can make**, and the
 * second aggregate in this schema to have one — `InfluencerHandleTakenError` is
 * the precedent and this is its mechanism unchanged. Every other rule here is a
 * zod schema or a `SELECT` the query layer runs first; this one is a unique index,
 * because the question is "does another row already say this" and no amount of
 * reading before the write settles it.
 *
 * A **name** cannot earn this error and deliberately so: two companies may
 * legitimately carry one name, so the name is not unique and the slug takes a
 * `-2`. A UEN is a registration number, which is one company's identifier — so
 * entering a company already in the book is a duplicate rather than a second
 * record, and it is the most ordinary mistake the create form can make.
 */
export class VendorUenTakenError extends Error {
  readonly uen: string
  constructor(uen: string) {
    super(`UEN already in this workspace: ${uen}`)
    this.name = 'VendorUenTakenError'
    this.uen = uen
  }
}

/**
 * Postgres `23505 unique_violation`, narrowed to the one index that means "this
 * company is already in the book".
 *
 * **Checked by constraint name, not by code alone**, for `isHandleUniqueViolation`'s
 * reason unchanged: any *other* unique violation reaching this line is a bug, and
 * answering it with a friendly message about a duplicate UEN would hide it.
 *
 * `vendors_workspace_slug_key` is deliberately **not** matched here. That one is
 * the create race `createVendor` documents — two concurrent creates of one name
 * both settling on the same free slug — and it is a different fact: nothing is
 * taken, two writers collided, and a retry succeeds. It keeps its 500.
 *
 * `pg` puts both fields on the error and neither is typed, so this reads them
 * defensively rather than importing a driver type into the query layer.
 */
function isUenUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const pgError = err as { code?: unknown; constraint?: unknown }
  return pgError.code === '23505' && pgError.constraint === 'vendors_workspace_uen_key'
}

/**
 * Full replacement of a vendor's brand links — delete, then insert.
 *
 * `replaceInfluencerBrands`' shape exactly. Add and remove are one verb, which is
 * what keeps the join table an implementation detail of this module, and the ids
 * are **sorted before insert** so the response's `brandIds` is byte-identical
 * across two reads of one row.
 */
async function replaceVendorBrands(
  tx: Tx,
  vendorId: VendorId,
  brandIds: BrandId[],
): Promise<BrandId[]> {
  await tx.delete(vendorBrands).where(eq(vendorBrands.vendorId, vendorId))
  const sorted = [...brandIds].sort((a, b) => a.localeCompare(b))
  if (sorted.length > 0) {
    await tx.insert(vendorBrands).values(sorted.map((brandId) => ({ vendorId, brandId })))
  }
  return sorted
}

/**
 * Full replacement of a vendor's contact list — delete, then insert in order.
 *
 * **Not sorted**, unlike the brand ids beside it, and that is the difference
 * between a set and a list. The brands are ticked boxes with no order a person
 * chose; the contacts arrive in the order the form shows them, and `position` is
 * that order. Sorting them would silently reorder a list somebody arranged.
 *
 * `position` is dense from 0 because the whole list is rewritten: there is no gap
 * for a removed row to leave behind, and no renumbering pass is needed.
 *
 * This is also what makes swapping the primary contact **one request**. A partial
 * unique index on `is_primary` would refuse the half of the swap that lands
 * first; here the rule is `VendorContactsSchema`'s refinement at the route
 * boundary and the write that follows it can only satisfy it.
 */
async function replaceVendorContacts(
  tx: Tx,
  vendorId: VendorId,
  contacts: VendorContact[],
): Promise<VendorContact[]> {
  await tx.delete(vendorContacts).where(eq(vendorContacts.vendorId, vendorId))
  if (contacts.length > 0) {
    await tx.insert(vendorContacts).values(
      contacts.map((contact, position) => ({
        vendorId,
        position,
        name: contact.name,
        role: contact.role,
        email: contact.email,
        phone: contact.phone,
        isPrimary: contact.isPrimary,
      })),
    )
  }
  return contacts
}

/** One vendor's brand ids, sorted. Used by the reads that hold a single row. */
async function brandIdsForVendor(dbOrTx: Tx | typeof db, vendorId: string): Promise<BrandId[]> {
  const joins = await dbOrTx
    .select({ brandId: vendorBrands.brandId })
    .from(vendorBrands)
    .where(eq(vendorBrands.vendorId, vendorId))
    .orderBy(asc(vendorBrands.brandId))
  return joins.map((j) => j.brandId as BrandId)
}

/** One vendor's contacts, in `position` order. Used by the reads that hold a single row. */
async function contactsForVendor(
  dbOrTx: Tx | typeof db,
  vendorId: string,
): Promise<VendorContact[]> {
  const rows = await dbOrTx
    .select()
    .from(vendorContacts)
    .where(eq(vendorContacts.vendorId, vendorId))
    .orderBy(asc(vendorContacts.position))
  return rows.map(rowToVendorContact)
}

/**
 * Every vendor in a workspace, in directory order (`name asc, id asc`) — the
 * ordering `byVendorName` mirrors.
 *
 * **Exhaustive, with no cursor and no filters**, the same call
 * `listOutletsByWorkspace` and `listInfluencersByWorkspace` make. The screen
 * above it counts and groups, and a client that filtered a *page* would render a
 * count over a set it does not hold. The search box and the two selects narrow an
 * array the client holds completely.
 *
 * It replaces a `useSWRInfinite` page loop that was paginating **nine fixture
 * rows** — sending `q` and `status` to a server that did not exist.
 *
 * That holds while a book is tens of rows. Past roughly 150, the keyset cursor on
 * `(name, id)` and the SQL filters land **together** — one without the other is
 * the "Zephyr alone on page one" failure `packages/web-next`'s AGENTS.md bans.
 *
 * **Three queries and two in-memory maps, not a `json_agg`.** The influencers
 * argument one relation further: the set is exhaustive and small, and array-shaped
 * columns would have to be unpacked differently here than on the detail read —
 * which is a second mapper for one wire shape. A `json_agg` over *two* relations
 * would also multiply the row count before it collapses it.
 */
export async function listVendorsByWorkspace(workspaceId: WorkspaceId): Promise<Vendor[]> {
  const rows = await db
    .select()
    .from(vendors)
    .where(eq(vendors.workspaceId, workspaceId))
    .orderBy(asc(vendors.name), asc(vendors.id))
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  const joins = await db
    .select()
    .from(vendorBrands)
    .where(inArray(vendorBrands.vendorId, ids))
    .orderBy(asc(vendorBrands.vendorId), asc(vendorBrands.brandId))
  const brandsByVendor = new Map<string, BrandId[]>()
  for (const join of joins) {
    const list = brandsByVendor.get(join.vendorId) ?? []
    list.push(join.brandId as BrandId)
    brandsByVendor.set(join.vendorId, list)
  }

  const contactRows = await db
    .select()
    .from(vendorContacts)
    .where(inArray(vendorContacts.vendorId, ids))
    .orderBy(asc(vendorContacts.vendorId), asc(vendorContacts.position))
  const contactsByVendor = new Map<string, VendorContact[]>()
  for (const row of contactRows) {
    const list = contactsByVendor.get(row.vendorId) ?? []
    list.push(rowToVendorContact(row))
    contactsByVendor.set(row.vendorId, list)
  }

  return rows.map((row) =>
    rowToVendor(row, brandsByVendor.get(row.id) ?? [], contactsByVendor.get(row.id) ?? []),
  )
}

/**
 * One vendor by **slug or id** — `/vendors/northlight-talent` and
 * `/vendors/<uuid>` land on the same record.
 *
 * Scoped by workspace, which is what makes it safe to accept a slug at all: slugs
 * are unique per workspace, not globally. It is also the access gate — an id from
 * another workspace misses here rather than being read across the boundary
 * `requireWorkspaceAccess` just checked.
 *
 * The `ref` is compared against `slug` unconditionally and against `id` only when
 * it looks like a uuid. Handing Postgres a non-uuid string to compare with a
 * `uuid` column raises `invalid input syntax for type uuid` — a 500 for what is
 * really a 404. `getOutletByRef` and `getInfluencerByRef` carry the same branch.
 */
export async function getVendorByRef(
  workspaceId: WorkspaceId,
  ref: string,
): Promise<Vendor | null> {
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)
  const match = looksLikeUuid
    ? or(eq(vendors.slug, ref), eq(vendors.id, ref))
    : eq(vendors.slug, ref)
  const rows = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.workspaceId, workspaceId), match))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return rowToVendor(row, await brandIdsForVendor(db, row.id), await contactsForVendor(db, row.id))
}

/**
 * Create one, deriving a free slug from the name.
 *
 * One transaction: the brand gate, the row, the link rows, the contact rows — a
 * brand from another workspace rolls back the lot rather than leaving a vendor
 * with half their brands and none of their people.
 *
 * The slug is chosen inside the transaction, against the workspace's slugs read in
 * the same transaction — so two concurrent creates of the same name cannot both
 * settle on `northlight-talent`. Under Postgres' default READ COMMITTED they still
 * can, which is why `vendors_workspace_slug_key` exists: the loser takes a unique
 * violation instead of silently overwriting. That is a 500 on a genuinely rare
 * race, and the honest trade against serialising every create.
 *
 * `vendors_workspace_uen_key` is the second violation this can take, and it is not
 * a race — it is the same company entered twice. **That one is caught** and becomes
 * `VendorUenTakenError`, which the route answers with a 409.
 */
export async function createVendor(
  workspaceId: WorkspaceId,
  input: CreateVendorInput,
): Promise<Vendor> {
  const brandIds = input.brandIds ?? []
  const contacts = input.contacts ?? []
  return db.transaction(async (tx) => {
    await assertBrandsInWorkspace(tx, workspaceId, brandIds)

    const taken = await tx
      .select({ slug: vendors.slug })
      .from(vendors)
      .where(eq(vendors.workspaceId, workspaceId))

    const inserted = await tx
      .insert(vendors)
      .values({
        workspaceId,
        slug: uniqueVendorSlug(
          input.name,
          taken.map((r) => r.slug),
        ),
        name: input.name,
        category: input.category ?? null,
        // `.default('active')` on the schema has already run, so the column
        // default is documentation rather than a second decision-maker.
        status: input.status,
        uen: input.uen ?? null,
        website: input.website ?? null,
        notes: input.notes ?? null,
      })
      .returning()
      .catch((err: unknown) => {
        // Inside the transaction, so the throw rolls back the brand gate's read
        // and any child row with it. Nothing half-written survives a duplicate.
        if (isUenUniqueViolation(err)) throw new VendorUenTakenError(input.uen ?? '')
        throw err
      })
    const [row] = inserted
    if (!row) throw new Error('createVendor returned no row')
    const vendorId = row.id as VendorId
    const linked = await replaceVendorBrands(tx, vendorId, brandIds)
    const named = await replaceVendorContacts(tx, vendorId, contacts)
    return rowToVendor(row, linked, named)
  })
}

/**
 * Patch one. Scoped by workspace as well as id, so an id from another workspace
 * misses rather than being written across the boundary.
 *
 * `undefined` leaves a key alone and `null` clears it — the distinction the whole
 * patch shape rests on, which is why every assignment below tests `!== undefined`
 * rather than truthiness. `brandIds` and `contacts` are full replacements.
 *
 * **`slug` is never touched.** It is frozen at create so a shared link survives a
 * corrected name; see `UpdateVendorInputSchema`.
 *
 * A patch that moves `uen` can land on a value the workspace already holds,
 * exactly as a create can, and it becomes the same `VendorUenTakenError`.
 *
 * **No read-before-write, unlike `updateInfluencer`.** That one reads the row
 * first because its unique key is a *pair* — a patch may move one half and leave
 * the other, and a failed transaction cannot be read from afterwards to find out
 * what the other half was. This key is one column, so the value that collided is
 * `patch.uen` and it is already in hand. A pre-read here would be a query whose
 * result nothing could use.
 */
export async function updateVendor(
  workspaceId: WorkspaceId,
  id: VendorId,
  patch: UpdateVendorInput,
): Promise<Vendor | null> {
  return db.transaction(async (tx) => {
    // Before the row lookup, so a bad brandId rejects the whole patch even when
    // the vendor itself would miss — the ordering `updateOutlet` and
    // `updateInfluencer` both use, and for the same reason: a 400 about the body
    // is more useful than a 404 about the path when both are true.
    if (patch.brandIds !== undefined) {
      await assertBrandsInWorkspace(tx, workspaceId, patch.brandIds)
    }

    const [row] = await tx
      .update(vendors)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.uen !== undefined ? { uen: patch.uen } : {}),
        ...(patch.website !== undefined ? { website: patch.website } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(vendors.id, id), eq(vendors.workspaceId, workspaceId)))
      .returning()
      .catch((err: unknown) => {
        if (isUenUniqueViolation(err)) throw new VendorUenTakenError(patch.uen ?? '')
        throw err
      })
    if (!row) return null

    const linked =
      patch.brandIds !== undefined
        ? await replaceVendorBrands(tx, id, patch.brandIds)
        : await brandIdsForVendor(tx, id)
    const named =
      patch.contacts !== undefined
        ? await replaceVendorContacts(tx, id, patch.contacts)
        : await contactsForVendor(tx, id)
    return rowToVendor(row, linked, named)
  })
}

/**
 * Hard delete, and deliberately not a soft one — `deleteOutlet`'s and
 * `deleteInfluencer`'s call.
 *
 * Soft delete exists in this schema where a discarded thing is *recoverable
 * creative work*: an idea, an asset, a planned post. A company is not that. One
 * you have stopped buying from is `status: 'inactive'`, and one you may not buy
 * from is `blacklisted` — between them they answer almost every reason somebody
 * reaches for delete here. What is left is a row entered by mistake, and a mistake
 * is the one thing worth actually removing.
 *
 * The link rows and the contact rows go with it, by cascade. Returns the row that
 * went, or `null` when nothing matched — so the route 404s on a second delete
 * rather than reporting success twice.
 *
 * **Both relations are read before the delete**, because after it there is nothing
 * to read them from. The route hands the row back as the last copy anything will
 * see, so it has to be the whole record.
 */
export async function deleteVendor(workspaceId: WorkspaceId, id: VendorId): Promise<Vendor | null> {
  return db.transaction(async (tx) => {
    const brandIds = await brandIdsForVendor(tx, id)
    const contacts = await contactsForVendor(tx, id)
    const [row] = await tx
      .delete(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.workspaceId, workspaceId)))
      .returning()
    return row ? rowToVendor(row, brandIds, contacts) : null
  })
}
