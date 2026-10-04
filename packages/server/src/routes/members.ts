import type { AuthProvider } from '@brandfactory/adapter-auth'
import { PasswordNotSupportedError, PasswordRejectedError } from '@brandfactory/adapter-auth'
import {
  CreateMemberSchema,
  ResetPasswordSchema,
  UpdateMemberSchema,
  type MemberSummary,
  type UserId,
} from '@brandfactory/shared'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../errors'

export interface MembersDeps {
  db: Db
  auth: AuthProvider
}

/**
 * Who may use Brand Base, and which brands they reach.
 *
 * **Admin only, by its mount** — `app.ts` puts `createAdminMiddleware()` on this
 * whole prefix, so there is no per-route check to forget. Launchpad's equivalent
 * file carries four inline ones because it has two admin roles; we have one.
 *
 * ⚠️ **No self-service route lives here.** A person's own password is
 * `POST /me/password`, under the prefix this app already uses for everything
 * about the caller. Launchpad keeps both under `/users`, which puts
 * `POST /users/me/password` and `POST /users/:id/password` in one file where
 * Hono's declaration order decides which one wins — it warns about that three
 * times. Ours cannot collide, and **a self-service route added here would
 * reintroduce the trap**, because this prefix is behind the admin gate.
 */
export function createMembersRouter(deps: MembersDeps) {
  /** The actor, for the guards and the audit. Always present behind the gate. */
  function actor(c: { var: AppEnv['Variables'] }) {
    const user = c.var.user
    if (!user) throw new UnauthorizedError()
    return user
  }

  /**
   * The row plus its grants, in the shape the screen reads.
   *
   * `id` arrives as a plain string — the schema's `uuid` column is not branded,
   * so `User.id` is `string` while the query helpers take `UserId`. The cast
   * lives here and in the handlers' `param()` reads, which are the two places a
   * bare string crosses into a branded signature.
   */
  async function summarise(row: {
    id: string
    email: string
    displayName: string | null
    role: 'admin' | null
    mustSetPassword: boolean
    deactivatedAt: string | null
    createdAt: string
  }): Promise<MemberSummary> {
    const id = row.id as UserId
    const brands = await deps.db.listBrandGrantsForUser(id)
    return { ...row, id, brands }
  }

  /**
   * Refuses to leave the workspace with no active administrator.
   *
   * A workspace with none cannot add anybody or restore anybody, and the only
   * way back is SQL against production. Launchpad guards this on delete and not
   * on its role edit, so a full admin there can demote the last one — including
   * itself — and lose the screen. Both paths are guarded here.
   */
  async function refuseIfLastAdmin(subject: { id: string; role: 'admin' | null }) {
    if (subject.role !== 'admin') return
    if ((await deps.db.countActiveAdmins()) <= 1) {
      throw new ConflictError(
        'this is the last administrator — promote somebody else first',
        'LAST_ADMIN',
      )
    }
  }

  return (
    new Hono<AppEnv>()
      .get('/', async (c) => {
        const rows = await deps.db.listMembers()
        return c.json({ members: await Promise.all(rows.map(summarise)) })
      })

      /**
       * Creates an account the way the Google Admin Console does: the
       * administrator chooses a first password, and the person replaces it on
       * their first authenticated request.
       *
       * **The order is forced, not stylistic.** `users.id` *is* the identity
       * provider's id, and `upsertUserById` conflicts on that column only — so
       * a row written with a fresh uuid collides on `email` the first time its
       * owner signs in, the adapter swallows that error, and the row is
       * unreachable forever. The provider account therefore comes first.
       */
      .post('/', zValidator('json', CreateMemberSchema), async (c) => {
        const me = actor(c)
        const input = c.req.valid('json')
        const email = input.email.toLowerCase()

        // Refused here rather than at the insert, so the administrator gets the
        // address back in a sentence instead of a 500 from a unique index. The
        // `lower(email)` index added in Phase A is still the backstop.
        if (await deps.db.getUserByEmail(email)) {
          throw new ConflictError(`${email} already has an account`, 'EMAIL_TAKEN')
        }

        // `holdsPasswords` rather than a provider name — `CLAUDE.md` forbids
        // naming a vendor in domain code, and the question here is a
        // capability. On the local dev provider no credential exists, so there
        // is nothing for an administrator to choose and nothing to flag.
        if (deps.auth.holdsPasswords && !input.password) {
          throw new ValidationError('a first password is required')
        }

        let providerId: string
        try {
          providerId = (
            await deps.auth.createUser({
              email,
              password: deps.auth.holdsPasswords ? input.password : undefined,
            })
          ).userId
        } catch (err) {
          if (err instanceof PasswordRejectedError) throw new ValidationError(err.message)
          if (err instanceof PasswordNotSupportedError) {
            throw new ValidationError('this deployment cannot create accounts')
          }
          throw err
        }

        let row
        try {
          row = await deps.db.insertMember({
            id: providerId,
            email,
            displayName: input.displayName ?? null,
            role: input.role ?? null,
            // False where no password exists to have been chosen by somebody
            // else. The column means *an administrator chose this account's
            // password*, and on a provider that holds none the claim is vacuous.
            mustSetPassword: deps.auth.holdsPasswords,
          })
          if (input.brands.length > 0) {
            await deps.db.setBrandGrants(row.id as UserId, input.brands)
          }
        } catch (err) {
          // **Compensation.** The provider account exists and our rows do not,
          // so leaving it would make every retry answer `EMAIL_TAKEN` at the
          // provider with nothing here to show for it. Launchpad does the same
          // and for the same reason.
          try {
            await deps.auth.deleteUser(providerId)
          } catch (cleanupErr) {
            const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
            c.var.log.error('members.create: rollback of the provider account failed', {
              providerId,
              error: msg,
            })
          }
          throw err
        }

        await deps.db.writeAudit({
          actorId: me.id as UserId,
          actorEmail: me.email,
          subjectId: row.id as UserId,
          subjectEmail: row.email,
          action: 'set-on-create',
        })
        for (const grant of input.brands) {
          await deps.db.writeAudit({
            actorId: me.id as UserId,
            actorEmail: me.email,
            subjectId: row.id as UserId,
            subjectEmail: row.email,
            action: 'granted',
            brandId: grant.brandId,
            toRole: grant.role,
          })
        }

        return c.json(await summarise(row), 201)
      })

      .patch('/:id', zValidator('json', UpdateMemberSchema), async (c) => {
        const me = actor(c)
        const id = c.req.param('id') as UserId
        const patch = c.req.valid('json')
        const subject = await deps.db.getUserById(id)
        if (!subject) throw new NotFoundError('member not found', 'MEMBER_NOT_FOUND')

        if (patch.role !== undefined && patch.role !== subject.role) {
          // **No self-demotion**, which is a different refusal from the
          // last-admin one and catches a case it does not: an administrator
          // dropping their own role on the very screen whose job is granting it.
          if (id === me.id) {
            throw new ForbiddenError('you cannot change your own administrator access')
          }
          if (patch.role === null) await refuseIfLastAdmin(subject)
        }

        const updated = await deps.db.updateMember(id, {
          ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
          ...(patch.role !== undefined ? { role: patch.role } : {}),
        })
        if (!updated) throw new NotFoundError('member not found', 'MEMBER_NOT_FOUND')

        if (patch.role !== undefined && patch.role !== subject.role) {
          await deps.db.writeAudit({
            actorId: me.id as UserId,
            actorEmail: me.email,
            subjectId: id,
            subjectEmail: subject.email,
            action: 'role_changed',
            fromRole: subject.role,
            toRole: patch.role,
          })
        }

        if (patch.brands !== undefined) {
          const diff = await deps.db.setBrandGrants(id, patch.brands)
          for (const g of diff.granted) {
            await deps.db.writeAudit({
              actorId: me.id as UserId,
              actorEmail: me.email,
              subjectId: id,
              subjectEmail: subject.email,
              action: 'granted',
              brandId: g.brandId,
              toRole: g.role,
            })
          }
          for (const g of diff.changed) {
            await deps.db.writeAudit({
              actorId: me.id as UserId,
              actorEmail: me.email,
              subjectId: id,
              subjectEmail: subject.email,
              action: 'role_changed',
              brandId: g.brandId,
              fromRole: g.from,
              toRole: g.to,
            })
          }
          for (const g of diff.revoked) {
            await deps.db.writeAudit({
              actorId: me.id as UserId,
              actorEmail: me.email,
              subjectId: id,
              subjectEmail: subject.email,
              action: 'revoked',
              brandId: g.brandId,
              fromRole: g.from,
            })
          }
        }

        return c.json(await summarise(updated))
      })

      /**
       * An administrator chooses a password for somebody who has lost theirs,
       * and the account is flagged again so the person replaces it.
       *
       * **Not for yourself.** Launchpad's reason is the sharpest of the three
       * guards: an administrator who reset their own password here *"would flag
       * themselves into the change screen with no admin left to free them."*
       * Your own password is `POST /me/password`.
       */
      .post('/:id/password', zValidator('json', ResetPasswordSchema), async (c) => {
        const me = actor(c)
        const id = c.req.param('id') as UserId
        if (id === me.id) {
          throw new ForbiddenError('use your own password screen to change your password')
        }
        const subject = await deps.db.getUserById(id)
        if (!subject) throw new NotFoundError('member not found', 'MEMBER_NOT_FOUND')

        try {
          await deps.auth.setPassword(id, c.req.valid('json').password)
        } catch (err) {
          if (err instanceof PasswordRejectedError) throw new ValidationError(err.message)
          if (err instanceof PasswordNotSupportedError) {
            throw new ValidationError('this deployment cannot set passwords')
          }
          throw err
        }

        // Only after the provider accepted it, and the same order as
        // `/me/password` for the mirror-image reason: flagging first and failing
        // second would lock somebody out over a password that was never changed.
        await deps.db.setMustSetPassword(id)
        await deps.db.writeAudit({
          actorId: me.id as UserId,
          actorEmail: me.email,
          subjectId: id,
          subjectEmail: subject.email,
          action: 'reset',
        })
        return c.body(null, 204)
      })

      .post('/:id/deactivate', async (c) => {
        const me = actor(c)
        const id = c.req.param('id') as UserId
        if (id === me.id) throw new ForbiddenError('you cannot deactivate your own account')
        const subject = await deps.db.getUserById(id)
        if (!subject) throw new NotFoundError('member not found', 'MEMBER_NOT_FOUND')
        await refuseIfLastAdmin(subject)

        const updated = await deps.db.setMemberDeactivated(id, true)
        if (!updated) throw new NotFoundError('member not found', 'MEMBER_NOT_FOUND')

        // ⚠️ **After our column, and failing softly** — the opposite order from
        // `reactivate`, on purpose. `deactivated_at` is the boundary, so by the
        // time this runs the account is already refused; a provider error leaves
        // a live credential nobody can use, which is not a failed deactivation.
        // Reporting it as one would invite a retry that looks like the first
        // attempt never worked.
        try {
          await deps.auth.setSuspended(id, true)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          c.var.log.error('members.deactivate: the provider account is still unsuspended', {
            id,
            error: msg,
          })
        }

        await deps.db.writeAudit({
          actorId: me.id as UserId,
          actorEmail: me.email,
          subjectId: id,
          subjectEmail: subject.email,
          action: 'deactivated',
        })
        return c.json(await summarise(updated))
      })

      .post('/:id/reactivate', async (c) => {
        const me = actor(c)
        const id = c.req.param('id') as UserId
        const subject = await deps.db.getUserById(id)
        if (!subject) throw new NotFoundError('member not found', 'MEMBER_NOT_FOUND')

        // **The provider first here, and the deactivate path does it last —
        // the orders are deliberately opposite.** Each one is ordered so that a
        // half-completed call leaves the account *less* reachable, not more.
        //
        // Withdrawing access: our column is the boundary, so writing it first
        // means the gate is already closed if the provider call then fails.
        // Restoring it: let the provider go first and propagate its failure, so
        // a 200 from this route means both halves are true. Writing our column
        // first would record a reactivation the person cannot actually use, and
        // the administrator would have no way to tell.
        await deps.auth.setSuspended(id, false)

        const updated = await deps.db.setMemberDeactivated(id, false)
        if (!updated) throw new NotFoundError('member not found', 'MEMBER_NOT_FOUND')

        await deps.db.writeAudit({
          actorId: me.id as UserId,
          actorEmail: me.email,
          subjectId: id,
          subjectEmail: subject.email,
          action: 'reactivated',
        })
        return c.json(await summarise(updated))
      })
  )
}
