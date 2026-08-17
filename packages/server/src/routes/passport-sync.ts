import { timingSafeEqual } from 'node:crypto'
import {
  applyEvent,
  SCHEMA_VERSION,
  verifySignature,
  type SyncHandlers,
} from '@missiongroupsystems/passport-client'
import { Hono } from 'hono'
import type { AppEnv } from '../context'
import type { Env } from '../env'
import { passportSyncHandlers } from '../passport/handlers'
import { reconcilePassportProjection, type ReconcileSummary } from '../passport/reconcile'

/**
 * `POST /webhooks/passport/sync` — the Passport sync receive endpoint.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 3.
 *
 * Registered in Passport as `https://<api-host>/webhooks/passport/sync`, **on the
 * backend host**. A `sync_url` pointing at the frontend has no such route:
 * Passport would deliver, nothing would receive, the projection would stay empty,
 * and nothing in this app would error.
 *
 * Mounted under `/webhooks`, which is deliberately outside every `authRequired`
 * prefix in `app.ts`. Passport authenticates with an HMAC over the raw body, not a
 * JWT, and there is no user to scope anything to — authenticity is the signature
 * and nothing else. The per-prefix middleware layout is what makes that a one-line
 * mount rather than a restructure, the same property that keeps `/blobs`,
 * `/health` and `/rt` outside the gate.
 *
 * ---------------------------------------------------------------------------
 * Every status code means something specific to Passport's delivery worker
 * ---------------------------------------------------------------------------
 *
 *   503  no secret configured   — refuse. An unset secret must never mean "accept
 *                                 anything", which would turn a misconfigured
 *                                 deploy into an open write endpoint onto the
 *                                 projection.
 *   401  bad/absent signature   — the worker PAUSES. Correct backpressure: a
 *                                 secret mismatch is not something retrying fixes.
 *   400  malformed JSON, or a
 *        stale schema_version    — permanent reject; retrying cannot help either.
 *   500  a handler threw        — the worker RETRIES. This is why handler errors
 *                                 must propagate and must never be swallowed: a
 *                                 swallowed error acks an event that was never
 *                                 applied, and the projection loses it forever.
 *   200  applied AND committed.
 *
 * The 500 arrives via `app.onError`, which maps an unhandled error to
 * `{ code: 'INTERNAL' }` with status 500 — exactly the retry semantics required.
 * So this route has no try/catch around `applyEvent`, on purpose.
 *
 * **Never log the body, the signature, or the secrets.** The body carries staff
 * emails and the signature is credential-equivalent.
 *
 * An unknown event type is a forward-compatible **200 no-op** — `applyEvent`
 * skips it. That is what lets Passport add event types without breaking a pinned
 * consumer.
 */
export interface PassportSyncDeps {
  env: Env
  /**
   * Injectable so the receive contract can be exercised with stub handlers.
   *
   * Everything this route enforces — signature verification, the
   * `schema_version` gate, the forward-compatible no-op, and 2xx only after the
   * handler resolves — is invisible to `tsc` and to the handler unit tests.
   * Without this seam the only way to test it would be against a live database,
   * which in practice means not testing it.
   */
  handlers?: SyncHandlers
  /**
   * Injectable so the endpoint's GUARD can be tested without a snapshot read.
   *
   * The guard is the part worth testing here: the reconciliation itself has its own
   * tests, but "refuses when unconfigured" and "refuses a wrong secret" are
   * properties of this route.
   */
  reconcile?: () => Promise<ReconcileSummary>
}

/** Constant-time comparison, so the endpoint does not leak the secret byte by byte. */
function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // `timingSafeEqual` throws on a length mismatch, which would itself be a length
  // oracle — so compare lengths first and still run the constant-time compare.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function createPassportSyncRouter(deps: PassportSyncDeps) {
  const handlers = deps.handlers ?? passportSyncHandlers

  const router = new Hono<AppEnv>().post('/passport/sync', async (c) => {
    const secret = deps.env.PASSPORT_WEBHOOK_SECRET

    // Fail CLOSED.
    if (!secret) {
      c.get('log')?.warn('passport sync delivery refused: PASSPORT_WEBHOOK_SECRET is not set')
      return c.json({ code: 'NOT_CONFIGURED', message: 'sync receiver not configured' }, 503)
    }

    // The signature covers the RAW bytes. Parsing first and re-serialising would
    // change them — key order, whitespace, unicode escapes — and every signature
    // would fail.
    const raw = new Uint8Array(await c.req.arrayBuffer())
    const header = c.req.header('X-Passport-Signature') ?? ''

    if (!verifySignature(secret, raw, header, deps.env.PASSPORT_WEBHOOK_SECRET_PREV ?? null)) {
      return c.json({ code: 'BAD_SIGNATURE', message: 'invalid signature' }, 401)
    }

    let envelope: Record<string, unknown>
    try {
      envelope = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>
    } catch {
      return c.json({ code: 'MALFORMED', message: 'malformed JSON' }, 400)
    }

    // Reject a stale envelope BEFORE dispatch. `SCHEMA_VERSION` governs the
    // envelope only; a bump means every event of the old shape must be refused
    // rather than half-understood.
    if (envelope.schema_version !== SCHEMA_VERSION) {
      return c.json(
        {
          code: 'SCHEMA_VERSION',
          message: `unsupported schema_version — this receiver speaks ${SCHEMA_VERSION}`,
        },
        400,
      )
    }

    // Deliberately NOT wrapped: an error must reach `app.onError` and become a
    // 500 so the delivery is retried.
    await applyEvent(envelope, handlers)

    return c.json({ ok: true }, 200)
  })

  /**
   * `POST /webhooks/passport/reconcile` — the manual trigger for nightly
   * reconciliation.
   *
   * **This route exists so the job can be verified by TRIGGERING it, rather than by
   * reading the code and assuming.** Writing the reconcile function and stopping is
   * the common failure: the function passes its own unit test, so the suite is green
   * and the write-up says "nightly reconciliation built" while nothing ever runs it.
   * A `404` here is the tell, and no test will show it to you.
   *
   * Guarded by `X-Reconcile-Secret`, and it **refuses to run when
   * `PASSPORT_RECONCILE_SECRET` is unset** rather than running unauthenticated. That
   * is the point twice over: an unconfigured scheduler must not be able to look like
   * a working one, and an open reconciliation endpoint is a way to hammer Passport's
   * API from the outside.
   *
   * The schedule itself is an in-process timer in `main.ts` — see
   * `../passport/reconcile.ts` for why the period is six hours rather than
   * twenty-four, and for the single-instance coupling.
   */
  router.post('/passport/reconcile', async (c) => {
    const secret = deps.env.PASSPORT_RECONCILE_SECRET

    if (!secret) {
      c.get('log')?.warn(
        'passport reconcile refused: PASSPORT_RECONCILE_SECRET is not set. An ' +
          'unconfigured trigger must not be able to look like a working one.',
      )
      return c.json({ code: 'NOT_CONFIGURED', message: 'reconcile trigger not configured' }, 503)
    }

    if (!secretMatches(c.req.header('X-Reconcile-Secret'), secret)) {
      return c.json({ code: 'FORBIDDEN', message: 'invalid reconcile secret' }, 403)
    }

    const run =
      deps.reconcile ?? (() => reconcilePassportProjection({ env: deps.env, log: c.get('log') }))

    // Errors propagate to `app.onError` → 500. A scheduler seeing a 500 is the
    // correct signal; swallowing it would report a clean pass over a failed run,
    // which is the one outcome this whole job exists to prevent.
    const summary = await run()
    return c.json({ ok: true, summary }, 200)
  })

  return router
}
