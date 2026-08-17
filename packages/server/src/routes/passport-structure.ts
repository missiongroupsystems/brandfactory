import {
  bumpWriteAttempt,
  countUnlinkedBrands,
  deleteWriteAttempt,
  getBrandStructure,
  getUserById,
  getWriteAttempt,
  listPassportUnits,
  listWriteAttempts,
  recordWriteAttempt,
  type StructureOperation,
} from '@brandfactory/db'
import { Hono, type Context } from 'hono'
import type { UserId } from '@brandfactory/shared'
import type { AppEnv } from '../context'
import type { Env } from '../env'
import { ForbiddenError, NotFoundError, ValidationError } from '../errors'
import { createPassportAccess, type PassportAccessService } from '../passport/access'
import { createBrandPromoter } from '../passport/promote-brand'
import {
  attachRelationBodySchema,
  canWriteStructure,
  createUnitBodySchema,
  profileSchemaFor,
  relationIsLegal,
  updateUnitBodySchema,
} from '../passport/structure-rules'
import {
  createStructureWriteClient,
  isRetryable,
  structureWriteMessage,
  type ActingPerson,
  type StructureWriteClient,
  type StructureWriteFailure,
  type UnitType,
} from '../passport/structure-write'

/**
 * Structure write-through — the documented rule 3 exception.
 *
 * Proposal: `docs/executing/passport-sync-consumer-proposal.md` §7 (the decision record).
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 9b.
 *
 * Mounted **under** the auth gate: every route here needs a person, their org and their
 * org role, and the forwarded token is theirs.
 *
 * ---------------------------------------------------------------------------
 * The gate is two layers, and Passport is the authoritative one
 * ---------------------------------------------------------------------------
 *
 * 1. This router refuses a caller whose `passport.membership.role` is not `Owner` or
 *    `Admin`, read **verbatim** from the projection. That exists for a clear error before a
 *    round trip, and because a route handler stays callable whether or not a button renders
 *    it — a hidden affordance is not an authorization check.
 * 2. Passport re-checks with `require_org_access`.
 *
 * **If the two disagree, Passport wins**, which is the whole reason layer 1 is allowed to
 * exist at all: it can only ever refuse something Passport would also refuse, never permit
 * something Passport would not. A projection lagging by a few seconds can therefore refuse
 * a freshly promoted Admin — visible, recoverable, and the correct direction to fail.
 *
 * Note the vocabulary: this is the **org** role. A brand `Manager` may not edit structure —
 * that is a role at a unit inside this app. Conflating the two ladders is what rule 8
 * forbids, and there is no `is_admin` or `_ROLE_MAP` anywhere here.
 *
 * ---------------------------------------------------------------------------
 * NOTHING here writes `passport.*`
 * ---------------------------------------------------------------------------
 *
 * The write goes to Passport; Passport emits `unit.upserted` / `unit_relation.created` /
 * `unit_app_access.created`; the receiver applies it. So a successful response returns
 * `{ pending: true }` and the UI shows the row as pending for about a second.
 *
 * Writing the projection here would fight the version guard and put a second writer on a
 * replica the whole design makes read-only. `passport-structure-write-guard.test.ts` sweeps
 * for it, because the tempting version of this — an optimistic local update so the list
 * refreshes instantly — looks like a UX improvement and is the thing that breaks it.
 */

export interface PassportStructureDeps {
  env: Env
  access?: PassportAccessService
  client?: StructureWriteClient
  /** Injectable so tests need no database. */
  reader?: {
    getUserById: typeof getUserById
    listUnits: typeof listPassportUnits
    getBrandStructure: typeof getBrandStructure
    countUnlinkedBrands: typeof countUnlinkedBrands
  }
  queue?: {
    record: typeof recordWriteAttempt
    list: typeof listWriteAttempts
    get: typeof getWriteAttempt
    bump: typeof bumpWriteAttempt
    remove: typeof deleteWriteAttempt
  }
}

/**
 * Who is acting, and where.
 *
 * **`organizationId` comes from the acting person's membership, never from configuration**
 * (rule 9). A configured org id read on the request path *is* the single-org bug: it makes
 * an Owner of org A an Owner across org B, and it silently drops every other org's units.
 */
interface Actor {
  person: ActingPerson
  platformUserId: string
  organizationId: string
  orgRole: string
  localUserId: string
}

export function createPassportStructureRouter(deps: PassportStructureDeps) {
  const access = deps.access ?? createPassportAccess()
  const client = deps.client ?? createStructureWriteClient(deps.env)
  const reader = deps.reader ?? {
    getUserById,
    listUnits: listPassportUnits,
    getBrandStructure,
    countUnlinkedBrands,
  }
  const queue =
    deps.queue ??
    ({
      record: recordWriteAttempt,
      list: listWriteAttempts,
      get: getWriteAttempt,
      bump: bumpWriteAttempt,
      remove: deleteWriteAttempt,
    } as const)

  // Built from the SAME client and queue as the routes below, so a promotion and a direct
  // create cannot diverge on what "retryable" means or where a failure is recorded.
  const promote = createBrandPromoter({ client, record: queue.record })

  const router = new Hono<AppEnv>()

  /**
   * Resolve the actor, or refuse.
   *
   * The order of the refusals is chosen so that each says the most useful true thing:
   *
   * 1. **No forwarded token → refuse.** The middleware guarantees one, so this is
   *    belt-and-braces; forwarding `undefined` would reach Passport as a `401` that reads
   *    as an expired session.
   * 2. **Not a Passport-issued session → refuse with that reason.** Checked before the
   *    role, because an app-native org Admin *is* an Admin and telling them they lack
   *    permission would be false.
   * 3. **Not an org Owner or Admin → refuse.**
   */
  async function actor(c: Context<AppEnv>): Promise<Actor> {
    const userId = c.get('userId')
    if (!userId) throw new ForbiddenError('no acting user')

    const header = c.req.header('authorization') ?? ''
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim()
    if (!token) throw new ForbiddenError('no forwarded token')

    const issuer = c.get('tokenIssuer') ?? 'app-native'
    if (issuer !== 'passport') {
      throw new ForbiddenError(structureWriteMessage({ kind: 'wrong-issuer' }))
    }

    // `userId as UserId` — the middleware set it from a verified token, and the brand is a
    // compile-time tag rather than a runtime check.
    const user = await reader.getUserById(userId as UserId)
    if (!user?.email) throw new ForbiddenError('the acting user has no verified email')

    // BY VERIFIED EMAIL, and refusing to guess on ambiguity — the same resolution the login
    // path uses, for the same reason: Passport's `sub` belongs to Passport's project.
    const resolved = await access.membershipForEmail(user.email)
    if (!resolved.ok) {
      throw new ForbiddenError(
        resolved.reason === 'ambiguous'
          ? 'This email matches more than one Mission Passport member, so the organisation cannot be determined.'
          : 'This account is not a member of any Mission Passport organisation.',
      )
    }

    const { membership } = resolved
    if (!canWriteStructure(membership.role)) {
      throw new ForbiddenError(structureWriteMessage({ kind: 'forbidden' }))
    }

    return {
      person: { token, issuer },
      platformUserId: membership.platformUserId,
      organizationId: membership.organizationId,
      orgRole: membership.role,
      localUserId: userId,
    }
  }

  /**
   * Turn a client failure into a response, queueing it when — and only when — a retry could
   * ever succeed.
   *
   * A `403` refuses again and a `422` fails identically until the input changes, so
   * queueing either produces a button that can never work. `isRetryable` is the single
   * place that decides, so the route and the retry endpoint cannot disagree.
   */
  async function fail(
    error: StructureWriteFailure,
    ctx: { actor: Actor; operation: StructureOperation; payload: unknown; unitId?: string | null },
  ): Promise<never> {
    const message = structureWriteMessage(error)
    if (isRetryable(error)) {
      await queue.record({
        organizationId: ctx.actor.organizationId,
        operation: ctx.operation,
        payload: ctx.payload,
        unitId: ctx.unitId ?? null,
        attemptedBy: ctx.actor.localUserId,
        lastError: message,
      })
    }
    if (error.kind === 'forbidden' || error.kind === 'wrong-issuer') {
      throw new ForbiddenError(message)
    }
    throw new ValidationError(message)
  }

  /** The stored type of a unit in this org, needed to validate an update's profile. */
  async function unitTypeOf(organizationId: string, unitId: string): Promise<UnitType> {
    // Read from the PROJECTION, not from Passport: this is exactly what the replica is for,
    // and an API read here would add a network hop and an uptime dependency to a check the
    // local row already answers.
    const units = await reader.listUnits(organizationId)
    const unit = units.find((u) => u.id === unitId)
    if (!unit) throw new NotFoundError('unit not found')
    const type = unit.type
    if (type !== 'entity' && type !== 'brand' && type !== 'outlet') {
      throw new ValidationError(`unit has an unrecognised type: ${type}`)
    }
    return type
  }

  // ── The seven operations ───────────────────────────────────────────────────

  const routes = router
    /**
     * Create a unit, then switch BrandFactory on at it.
     *
     * **Two calls, and the second is not optional.** A unit carrying no
     * `unit_app_access` row for this app confers access to **nobody** — not even an org
     * Owner, because the ladder still requires a unit that carries the app. So a create
     * whose second call fails leaves a unit nobody in this app can see, which looks exactly
     * like a broken create.
     *
     * When the second call fails the response says so explicitly and the enable is queued.
     * The unit is **not** rolled back: it exists in Passport, sibling apps may already have
     * received the event, and deleting it to tidy up our own half-failure would be a
     * destructive write nobody asked for.
     */
    .post('/units', async (c) => {
      const who = await actor(c)
      const parsed = createUnitBodySchema.safeParse(await c.req.json().catch(() => null))
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'invalid body')
      const body = parsed.data

      const created = await client.createUnit(who.person, who.organizationId, body)
      if (!created.ok) {
        return fail(created.error, { actor: who, operation: 'unit.create', payload: body })
      }

      const unit = created.value
      const enabled = await client.enableApp(who.person, who.organizationId, unit.id)
      if (!enabled.ok) {
        const message = structureWriteMessage(enabled.error)
        if (isRetryable(enabled.error)) {
          await queue.record({
            organizationId: who.organizationId,
            operation: 'unit_app_access.enable',
            payload: { unitId: unit.id },
            unitId: unit.id,
            attemptedBy: who.localUserId,
            lastError: message,
          })
        }
        // 207-ish, expressed as a body rather than a status: the unit really was created,
        // so a 4xx would be a lie and a 2xx alone would hide the half.
        return c.json(
          {
            unitId: unit.id,
            pending: true,
            appAccessEnabled: false,
            warning: `The ${body.type} was created in Mission Passport, but BrandFactory could not be switched on at it: ${message} Until that succeeds it is visible to nobody here.`,
          },
          201,
        )
      }

      return c.json({ unitId: unit.id, pending: true, appAccessEnabled: true }, 201)
    })

    .patch('/units/:unitId', async (c) => {
      const who = await actor(c)
      const unitId = c.req.param('unitId')
      const parsed = updateUnitBodySchema.safeParse(await c.req.json().catch(() => null))
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'invalid body')

      // The profile's legal shape depends on the unit's STORED type, so it is validated
      // here rather than in the body schema. A brand has no profile fields at all, so an
      // update carrying any is refused before it can become a `422`.
      const body = parsed.data
      if (body.profile !== undefined) {
        const type = await unitTypeOf(who.organizationId, unitId)
        const profile = profileSchemaFor(type).safeParse(body.profile)
        if (!profile.success) {
          const issue = profile.error.issues[0]
          const field = issue?.path.join('.') ?? 'profile'
          throw new ValidationError(
            type === 'brand'
              ? 'A brand carries no address or registration details in Mission Passport.'
              : `${field}: ${issue?.message ?? 'not allowed for this unit type'}`,
          )
        }
      }

      const updated = await client.updateUnit(who.person, who.organizationId, unitId, body)
      if (!updated.ok) {
        return fail(updated.error, {
          actor: who,
          operation: 'unit.update',
          payload: body,
          unitId,
        })
      }
      return c.json({ unitId, pending: true })
    })

    /**
     * Archive a unit.
     *
     * Destructive in effect rather than in form: an archived unit stops conferring access
     * to **everyone** at it. The confirmation copy says that, and the UI never reaches this
     * without it.
     */
    .post('/units/:unitId/archive', async (c) => {
      const who = await actor(c)
      const unitId = c.req.param('unitId')
      const archived = await client.archiveUnit(who.person, who.organizationId, unitId)
      if (!archived.ok) {
        return fail(archived.error, {
          actor: who,
          operation: 'unit.archive',
          payload: { unitId },
          unitId,
        })
      }
      return c.json({ unitId, pending: true })
    })

    .post('/unit-relations', async (c) => {
      const who = await actor(c)
      const parsed = attachRelationBodySchema.safeParse(await c.req.json().catch(() => null))
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'invalid body')
      const body = parsed.data

      // Both ends checked against the projection before the request. Passport answers `422`
      // for an illegal pairing, but the message names a constraint rather than the form
      // field, and a correct pairing sent BACKWARDS is the common mistake.
      const fromType = await unitTypeOf(who.organizationId, body.from_unit_id)
      if (!relationIsLegal(fromType, body.relation)) {
        throw new ValidationError(`A ${fromType} cannot have a ${body.relation} relation.`)
      }

      const attached = await client.attachRelation(who.person, who.organizationId, body)
      if (!attached.ok) {
        return fail(attached.error, {
          actor: who,
          operation: 'unit_relation.attach',
          payload: body,
          unitId: body.from_unit_id,
        })
      }
      return c.json({ relationId: attached.value?.id ?? null, pending: true }, 201)
    })

    /**
     * Detach a relation.
     *
     * **Never called automatically to resolve a `409`.** Relations are immutable in
     * Passport, so re-parenting is a detach then an attach — and a `409` on the attach means
     * a relation already exists, which the app must not "fix" by deleting whatever is there.
     * Under a cascade the existing edge may be the only thing granting a set of people
     * access to an outlet.
     */
    .delete('/unit-relations/:relationId', async (c) => {
      const who = await actor(c)
      const relationId = c.req.param('relationId')
      const detached = await client.detachRelation(who.person, who.organizationId, relationId)
      if (!detached.ok) {
        return fail(detached.error, {
          actor: who,
          operation: 'unit_relation.detach',
          payload: { relationId },
        })
      }
      return c.json({ relationId, pending: true })
    })

    .put('/units/:unitId/app-access', async (c) => {
      const who = await actor(c)
      const unitId = c.req.param('unitId')
      const enabled = await client.enableApp(who.person, who.organizationId, unitId)
      if (!enabled.ok) {
        return fail(enabled.error, {
          actor: who,
          operation: 'unit_app_access.enable',
          payload: { unitId },
          unitId,
        })
      }
      return c.json({ unitId, pending: true })
    })

    .delete('/units/:unitId/app-access', async (c) => {
      const who = await actor(c)
      const unitId = c.req.param('unitId')
      const disabled = await client.disableApp(who.person, who.organizationId, unitId)
      if (!disabled.ok) {
        return fail(disabled.error, {
          actor: who,
          operation: 'unit_app_access.disable',
          payload: { unitId },
          unitId,
        })
      }
      return c.json({ unitId, pending: true })
    })

    /**
     * Promote a locally created brand into a Passport unit.
     *
     * Plan 8e; decision proposal §6.1. **This is the Admin half of the split create.**
     *
     * A brand authored while Passport was unreachable exists here with no unit, and is
     * usable. Anyone who may create a brand can make one; **only an org Admin on a
     * hosted-login session can promote it**, which `actor()` enforces before this body runs.
     *
     * That asymmetry is the security property, not an inconvenience: a non-Admin create that
     * reached Passport unattended would let a consumer app add units to an organisation's
     * structure with no org Admin involved, and every sibling app in the suite would then
     * read them.
     */
    .post('/brands/:brandId/promote', async (c) => {
      const who = await actor(c)
      const brandId = c.req.param('brandId')

      const brand = await reader.getBrandStructure(brandId)
      if (!brand) throw new NotFoundError('brand not found')

      // Cross-org denial, through the same read the rest of this router uses. A brand whose
      // workspace belongs to another organisation must not be promotable from this session.
      if (brand.organizationId !== who.organizationId) throw new NotFoundError('brand not found')

      // Already linked. Idempotent rather than an error: two Admins pressing the button, or a
      // retry after a response was lost, must not read as a failure.
      if (brand.unitId) return c.json({ brandId, unitId: brand.unitId, alreadyLinked: true })

      const result = await promote({
        person: who.person,
        organizationId: who.organizationId,
        brandId,
        // The DISPLAY label goes up as the unit's LEGAL name. That is the honest default for
        // a brand Passport has never seen — there is no legal name to preserve — and an Admin
        // corrects it in the console or through the update route afterwards.
        name: brand.displayName,
        type: 'brand',
        attemptedBy: who.localUserId,
      })

      if (!result.ok) {
        // The brand is untouched and still usable. A failed promotion is not a failed create,
        // and must not read as one.
        throw new ValidationError(result.message)
      }

      return c.json({
        brandId,
        unitId: result.unitId,
        // `pending`, because the LINK arrives by event: Passport emits `unit.upserted` and
        // `passport/link-brand.ts` sets `brands.passport_unit_id`. Reporting the brand as
        // linked here would be a lie for about a second, and the UI would then "correct"
        // itself in a way that reads as a bug.
        pending: true,
        ...('appAccessEnabled' in result
          ? { appAccessEnabled: false, warning: result.message }
          : { appAccessEnabled: true }),
      })
    })

    /**
     * How many brands in a workspace Passport does not know about.
     *
     * **Not optional under `D1-b`** (proposal §7.6). A queue nobody drains leaves a growing
     * set of brands that exist here and nowhere else — invisible to every sibling app, with
     * nothing failing. This is the number that makes that visible.
     *
     * Separate from the failed-write queue, and they must not be merged: an unlinked brand is
     * usually just waiting for an Admin, while a queued row is a write that actually failed.
     */
    .get('/workspaces/:workspaceId/unlinked', async (c) => {
      const who = await actor(c)
      void who
      const workspaceId = c.req.param('workspaceId')
      return c.json({ workspaceId, unlinked: await reader.countUnlinkedBrands(workspaceId) })
    })

    // ── The retry surface ───────────────────────────────────────────────────
    //
    // The **only** reader of `passport_write_attempts`. That is what keeps the table from
    // being a rule-7 shadow: no brand list, no name resolution, no authorization check
    // touches it.

    .get('/write-attempts', async (c) => {
      const who = await actor(c)
      const rows = await queue.list(who.organizationId)
      return c.json({
        attempts: rows.map((r) => ({
          id: r.id,
          operation: r.operation,
          unitId: r.unitId,
          attempts: r.attempts,
          lastError: r.lastError,
          createdAt: r.createdAt,
        })),
      })
    })

    /**
     * Retry one attempt.
     *
     * **Runs only when an Admin presses the button, and cannot be a background job.** The
     * forwarded token is the acting person's and is never stored, so there is no credential
     * to retry with when nobody is present. That is the constraint recorded in the table's
     * header, not an omission to engineer around.
     */
    .post('/write-attempts/:id/retry', async (c) => {
      const who = await actor(c)
      const id = c.req.param('id')
      const row = await queue.get(id, who.organizationId)
      if (!row) throw new NotFoundError('no such write attempt')

      const result = await replay(who, row.operation, row.payload, row.unitId)
      if (!result.ok) {
        const message = structureWriteMessage(result.error)
        await queue.bump(id, who.organizationId, message)
        throw new ValidationError(message)
      }

      // Deleted on success. A `status` column distinguishing done from discarded would turn
      // a queue into a history, and a history is something screens read.
      await queue.remove(id, who.organizationId)
      return c.json({ id, pending: true })
    })

    /** Discard one. Same deletion as a success, because the row means the same thing. */
    .delete('/write-attempts/:id', async (c) => {
      const who = await actor(c)
      const id = c.req.param('id')
      const row = await queue.get(id, who.organizationId)
      if (!row) throw new NotFoundError('no such write attempt')
      await queue.remove(id, who.organizationId)
      return c.json({ id, discarded: true })
    })

  /**
   * Re-issue a queued operation.
   *
   * The payload is re-sent **verbatim**, deliberately: it was validated when it was first
   * submitted, and re-deriving it would let a rule change between the attempt and the retry
   * turn a stored request into a different one.
   *
   * An unrecognised operation cannot be replayed. It surfaces as a plain failure rather than
   * being silently dropped, because a silently unretryable row sits on the retry screen for
   * ever answering nothing.
   */
  async function replay(
    who: Actor,
    operation: string,
    payload: unknown,
    unitId: string | null,
  ): Promise<{ ok: true } | { ok: false; error: StructureWriteFailure }> {
    const body = (payload ?? {}) as Record<string, unknown>
    switch (operation) {
      case 'unit.create': {
        // `externalRef` is split off BEFORE parsing, and is not part of the wire schema.
        //
        // A queued create comes from one of two places: a route body a client sent, which
        // must never carry a ref, or a promotion (`passport/promote-brand.ts`), which always
        // does. `createUnitBodySchema` is `.strict()` precisely so a client cannot choose a
        // unit's `external_ref` — and leaving it in would make every promoted retry fail to
        // parse, which presents as "the retry button does nothing".
        const { externalRef, ...rest } = body as { externalRef?: unknown }
        const parsed = createUnitBodySchema.safeParse(rest)
        if (!parsed.success) {
          return {
            ok: false,
            error: { kind: 'invalid', message: 'the queued body is no longer valid' },
          }
        }
        const created = await client.createUnit(who.person, who.organizationId, {
          ...parsed.data,
          // Carried through verbatim. Re-deriving it would break the link for a brand whose
          // id the queue already recorded.
          ...(typeof externalRef === 'string' ? { externalRef } : {}),
        })
        if (!created.ok) return created
        // The second call again, for the same reason it is not optional above.
        const enabled = await client.enableApp(who.person, who.organizationId, created.value.id)
        return enabled.ok ? { ok: true } : enabled
      }
      case 'unit.update': {
        if (!unitId)
          return {
            ok: false,
            error: { kind: 'invalid', message: 'the queued attempt names no unit' },
          }
        const updated = await client.updateUnit(who.person, who.organizationId, unitId, body)
        return updated.ok ? { ok: true } : updated
      }
      case 'unit.archive': {
        if (!unitId)
          return {
            ok: false,
            error: { kind: 'invalid', message: 'the queued attempt names no unit' },
          }
        const archived = await client.archiveUnit(who.person, who.organizationId, unitId)
        return archived.ok ? { ok: true } : archived
      }
      case 'unit_relation.attach': {
        const parsed = attachRelationBodySchema.safeParse(body)
        if (!parsed.success) {
          return {
            ok: false,
            error: { kind: 'invalid', message: 'the queued body is no longer valid' },
          }
        }
        const attached = await client.attachRelation(who.person, who.organizationId, parsed.data)
        return attached.ok ? { ok: true } : attached
      }
      case 'unit_relation.detach': {
        const relationId = typeof body.relationId === 'string' ? body.relationId : null
        if (!relationId)
          return {
            ok: false,
            error: { kind: 'invalid', message: 'the queued attempt names no relation' },
          }
        const detached = await client.detachRelation(who.person, who.organizationId, relationId)
        return detached.ok ? { ok: true } : detached
      }
      case 'unit_app_access.enable': {
        if (!unitId)
          return {
            ok: false,
            error: { kind: 'invalid', message: 'the queued attempt names no unit' },
          }
        const enabled = await client.enableApp(who.person, who.organizationId, unitId)
        return enabled.ok ? { ok: true } : enabled
      }
      case 'unit_app_access.disable': {
        if (!unitId)
          return {
            ok: false,
            error: { kind: 'invalid', message: 'the queued attempt names no unit' },
          }
        const disabled = await client.disableApp(who.person, who.organizationId, unitId)
        return disabled.ok ? { ok: true } : disabled
      }
      default:
        return {
          ok: false,
          error: {
            kind: 'invalid',
            message: `cannot retry an unrecognised operation: ${operation}`,
          },
        }
    }
  }

  return routes
}
