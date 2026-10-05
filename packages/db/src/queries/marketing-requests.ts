import type {
  BrandId,
  CreateMarketingRequestInput,
  MarketingRequest,
  MarketingRequestId,
  OutletId,
  UpdateMarketingRequestInput,
  UserId,
  WorkspaceId,
} from '@brandfactory/shared'
import { MARKETING_REQUEST_FIRST_NUMBER, isClosedStatus } from '@brandfactory/shared'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../client'
import { rowToMarketingRequest } from '../mappers'
import { marketingRequests, outlets, users, workspaces } from '../schema'
import { assertBrandsInWorkspace } from './brand-scope'

/**
 * A write named an outlet that is not the request's brand's — another brand's,
 * an unbranded one, one in another workspace, or none at all. Indistinguishable
 * on purpose, as `BrandNotInWorkspaceError` is. The route answers 400
 * `OUTLET_NOT_IN_BRAND`.
 */
export class OutletNotInBrandError extends Error {
  constructor(outletId: OutletId) {
    super(`Outlet not in the request's brand: ${outletId}`)
    this.name = 'OutletNotInBrandError'
  }
}

/**
 * An assignee id that is not assignable: no account behind it, or a deactivated
 * one. The route answers 400 `ASSIGNEE_NOT_FOUND` for both.
 *
 * **One code for two causes, deliberately.** The picker offers only assignable
 * people, so either cause means the caller sent an id no screen offered — a
 * stale list or a hand-made request. Telling those apart would also tell a
 * caller which ids are real accounts, and nothing on this screen needs to know.
 */
export class AssigneeNotFoundError extends Error {
  constructor(userId: UserId) {
    super(`No assignable user with id: ${userId}`)
    this.name = 'AssigneeNotFoundError'
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Reader = Pick<Tx, 'select'>

const requester = alias(users, 'requester')
const assignee = alias(users, 'assignee')

/** One select for every read, so a list row and a single read cannot differ. */
function selectRequests(reader: Reader) {
  return reader
    .select({
      request: marketingRequests,
      requester: { id: requester.id, email: requester.email, displayName: requester.displayName },
      assignee: { id: assignee.id, email: assignee.email, displayName: assignee.displayName },
    })
    .from(marketingRequests)
    .leftJoin(requester, eq(requester.id, marketingRequests.requestedByUserId))
    .leftJoin(assignee, eq(assignee.id, marketingRequests.assigneeUserId))
}

type JoinedRow = Awaited<ReturnType<ReturnType<typeof selectRequests>['where']>>[number]

function toRequest(row: JoinedRow): MarketingRequest {
  return rowToMarketingRequest(row.request, row.requester, row.assignee)
}

async function readOne(
  reader: Reader,
  workspaceId: WorkspaceId,
  id: MarketingRequestId,
): Promise<MarketingRequest | null> {
  const rows = await selectRequests(reader).where(
    and(
      eq(marketingRequests.id, id),
      eq(marketingRequests.workspaceId, workspaceId),
      isNull(marketingRequests.deletedAt),
    ),
  )
  return rows[0] ? toRequest(rows[0]) : null
}

async function assertOutletInBrand(
  tx: Tx,
  workspaceId: WorkspaceId,
  brandId: BrandId,
  outletId: OutletId | null | undefined,
): Promise<void> {
  if (!outletId) return
  const rows = await tx
    .select({ id: outlets.id })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, outletId),
        eq(outlets.workspaceId, workspaceId),
        eq(outlets.brandId, brandId),
      ),
    )
  if (rows.length === 0) throw new OutletNotInBrandError(outletId)
}

/**
 * Whether a request may be handed to this account.
 *
 * ⚠️ **This checked only that the row existed until 5 October 2026**, which let
 * a request be assigned to a **deactivated** account: the route answered 200,
 * the inbox showed their name in the Assigned column, and the work sat with
 * somebody who could not sign in. Nothing had hit it because the only value the
 * screen could send was the caller's own id — the assignee picker is what makes
 * every other id reachable, so the guard and the picker land together.
 *
 * `deactivated_at IS NULL` **is** the workspace rule, not a narrower one.
 * `requireWorkspaceAccess` admits any active account because there is one
 * workspace and no `user_workspaces` table, so this is the same set
 * `listActivePeople` offers — which is the property worth keeping: every refusal
 * here means a stale list or a hand-made request, so neither needs its own code
 * or its own message.
 *
 * `null` passes, because clearing the assignee is a write this guard has no
 * opinion about.
 *
 * **Deactivation does not unassign.** A request already held by somebody who is
 * later deactivated keeps their name: the history is true and the inbox should
 * show who is holding it. This guard is about new writes only. Adding a sweep to
 * the deactivate route would be one line and would silently empty the Assigned
 * column for work that is still genuinely theirs.
 */
async function assertAssignable(tx: Tx, userId: UserId | null | undefined): Promise<void> {
  if (!userId) return
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deactivatedAt)))
  if (rows.length === 0) throw new AssigneeNotFoundError(userId)
}

/**
 * Every live request in a workspace, newest first (`created_at desc, number
 * desc` — the number breaks a tie between two requests in one transaction's
 * clock tick).
 *
 * **Exhaustive, with no cursor**, the outlets and influencers trade: the inbox
 * counts each status rung, and a count over a page is a false number. That holds
 * while an inbox is hundreds of rows. Past ~500, this grows a cursor and the
 * status filter moves to SQL in the same change.
 */
export async function listMarketingRequestsByWorkspace(
  workspaceId: WorkspaceId,
): Promise<MarketingRequest[]> {
  const rows = await selectRequests(db)
    .where(and(eq(marketingRequests.workspaceId, workspaceId), isNull(marketingRequests.deletedAt)))
    .orderBy(desc(marketingRequests.createdAt), desc(marketingRequests.number))
  return rows.map(toRequest)
}

/** One live request, scoped by workspace — an id from elsewhere misses. */
export async function getMarketingRequest(
  workspaceId: WorkspaceId,
  id: MarketingRequestId,
): Promise<MarketingRequest | null> {
  return readOne(db, workspaceId, id)
}

/**
 * File a request. It always arrives `new`, and the requester is the session's
 * user, passed by the route — never a body field.
 *
 * **The number.** The workspace row is locked `FOR UPDATE` first, so concurrent
 * creates in one workspace queue on it and each reads the maximum the previous
 * one wrote. Other workspaces are not blocked. Soft-deleted rows count: a
 * deleted `MR-1004` is never reissued, because somebody may already have quoted
 * it in a message.
 */
export async function createMarketingRequest(
  workspaceId: WorkspaceId,
  requestedByUserId: UserId | null,
  input: CreateMarketingRequestInput,
): Promise<MarketingRequest> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update')
    await assertBrandsInWorkspace(tx, workspaceId, [input.brandId])
    await assertOutletInBrand(tx, workspaceId, input.brandId, input.outletId)
    // The auth adapter upserts the user on sign-in but only warns if that
    // write fails. A session with no row behind it files the request with no
    // requester rather than failing the foreign key on a 500.
    const known = requestedByUserId
      ? await tx.select({ id: users.id }).from(users).where(eq(users.id, requestedByUserId))
      : []

    const [{ next }] = (await tx
      .select({
        next: sql<number>`coalesce(max(${marketingRequests.number}), ${MARKETING_REQUEST_FIRST_NUMBER - 1}) + 1`,
      })
      .from(marketingRequests)
      .where(eq(marketingRequests.workspaceId, workspaceId))) as [{ next: number }]

    const [row] = await tx
      .insert(marketingRequests)
      .values({
        workspaceId,
        brandId: input.brandId,
        outletId: input.outletId ?? null,
        number: Number(next),
        type: input.type,
        priority: input.priority,
        summary: input.summary,
        details: input.details ?? null,
        neededBy: input.neededBy ?? null,
        requestedByUserId: known.length > 0 ? requestedByUserId : null,
      })
      .returning({ id: marketingRequests.id })
    const created = await readOne(tx, workspaceId, row!.id as MarketingRequestId)
    return created!
  })
}

/**
 * Patch one live request.
 *
 * **The outlet is checked against the brand the row will have**, not the one
 * the patch names: moving a request to another brand without sending an outlet
 * keeps the old outlet, and that outlet must belong to the new brand too. A
 * client that means "no outlet" sends `outletId: null` with the brand.
 *
 * `resolvedAt` follows the status: set on the move into a closed state, kept
 * while it stays closed (a `resolved` → `declined` correction does not restart
 * the clock), cleared on the move out.
 */
export async function updateMarketingRequest(
  workspaceId: WorkspaceId,
  id: MarketingRequestId,
  patch: UpdateMarketingRequestInput,
): Promise<MarketingRequest | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(marketingRequests)
      .where(
        and(
          eq(marketingRequests.id, id),
          eq(marketingRequests.workspaceId, workspaceId),
          isNull(marketingRequests.deletedAt),
        ),
      )
      .for('update')
    if (!existing) return null

    const brandId = (patch.brandId ?? existing.brandId) as BrandId
    const outletId =
      patch.outletId !== undefined ? patch.outletId : (existing.outletId as OutletId | null)
    if (patch.brandId !== undefined) await assertBrandsInWorkspace(tx, workspaceId, [brandId])
    if (patch.brandId !== undefined || patch.outletId !== undefined) {
      await assertOutletInBrand(tx, workspaceId, brandId, outletId)
    }
    await assertAssignable(tx, patch.assigneeUserId)

    const now = new Date().toISOString()
    let resolvedAt: string | null | undefined
    if (patch.status !== undefined) {
      const wasClosed = isClosedStatus(existing.status)
      const isClosed = isClosedStatus(patch.status)
      if (isClosed && !wasClosed) resolvedAt = now
      if (!isClosed) resolvedAt = null
    }

    await tx
      .update(marketingRequests)
      .set({
        ...(patch.brandId !== undefined ? { brandId: patch.brandId } : {}),
        ...(patch.outletId !== undefined ? { outletId: patch.outletId } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
        ...(patch.details !== undefined ? { details: patch.details } : {}),
        ...(patch.neededBy !== undefined ? { neededBy: patch.neededBy } : {}),
        ...(patch.assigneeUserId !== undefined ? { assigneeUserId: patch.assigneeUserId } : {}),
        ...(resolvedAt !== undefined ? { resolvedAt } : {}),
        updatedAt: now,
      })
      .where(eq(marketingRequests.id, id))
    return readOne(tx, workspaceId, id)
  })
}

/**
 * Soft delete. Returns the row as it was, or `null` when nothing live matched,
 * so a second delete 404s rather than reporting success twice.
 */
export async function softDeleteMarketingRequest(
  workspaceId: WorkspaceId,
  id: MarketingRequestId,
): Promise<MarketingRequest | null> {
  return db.transaction(async (tx) => {
    const existing = await readOne(tx, workspaceId, id)
    if (!existing) return null
    await tx
      .update(marketingRequests)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(marketingRequests.id, id))
    return existing
  })
}
