import { PassportClient, type SyncHandlers } from '@missiongroupsystems/passport-client'
import type { Env } from '../env'
import type { Logger } from '../logger'
import { passportSyncHandlers } from './handlers'

/**
 * Nightly reconciliation — re-apply `snapshot()` over the projection.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 5.
 *
 * The receiver is the primary path; this is the backstop for anything it missed —
 * a delivery lost while the service was down long enough to exhaust retries, a bug
 * fixed after the fact, a fresh environment. Snapshot scope equals delivery scope,
 * so at steady state a correct receiver's projection already equals the snapshot
 * per collection and this is a no-op.
 *
 * ---------------------------------------------------------------------------
 * Four rules that make it safe
 * ---------------------------------------------------------------------------
 *
 * 1. **Re-apply through the SAME handlers the receiver uses.** Not a second write
 *    path: a parallel implementation would drift from the version guard and the
 *    tombstone rules, and the drift would only show under replay.
 *
 * 2. **Every org, no filter** (rule 9). The snapshot spans every entitled org.
 *    Narrowing it here would re-introduce exactly the single-org bug reconciliation
 *    exists to heal, and would report permanent phantom drift on every other org.
 *
 * 3. **`identity_links` are UPSERT-ONLY and never pruned.** The snapshot's copy is
 *    a per-org SUBSET and is not authoritative — and this app writes its OWN
 *    identity-link rows at login, with subjects Passport does not know. A prune
 *    would delete the very rows that make sessions resolve, and they would not come
 *    back until each user logged in again.
 *
 * 4. **An empty snapshot is NOT proof of an empty org.** With no active entitlement
 *    it returns eight empty collections whether or not anything is wrong — which is
 *    this app's exact situation until an entitlement is granted. So "snapshot empty"
 *    is never read as "delete everything".
 *
 * **This job does not prune at all.** It converges by upsert. Detecting and removing
 * rows Passport no longer has needs a per-collection authority answer — identity
 * links are explicitly not authoritative — and doing it casually here would turn a
 * transient API hiccup into data loss.
 */

export interface ReconcileSummary {
  organizations: number
  units: number
  unitRelations: number
  memberships: number
  identityLinks: number
  entitlements: number
  unitAppAccesses: number
  unitAppMemberships: number
  durationMs: number
  /** True when every collection came back empty — see rule 4 above. */
  empty: boolean
}

export interface ReconcileDeps {
  env: Env
  log?: Logger
  /** Injectable so tests need no network. */
  client?: { snapshot: () => Promise<Awaited<ReturnType<PassportClient['snapshot']>>> }
  /** Injectable so tests need no database. Defaults to the receiver's handlers. */
  handlers?: SyncHandlers
  now?: () => number
}

/**
 * Fetch the snapshot and re-apply it in FK-safe order.
 *
 * **Throws** on missing configuration or an API failure. Silently succeeding on an
 * unreachable Passport would make a broken reconciliation indistinguishable from a
 * clean one, which is the failure this whole job exists to prevent.
 */
export async function reconcilePassportProjection(deps: ReconcileDeps): Promise<ReconcileSummary> {
  const { env, log } = deps
  const baseUrl = env.PASSPORT_API_URL?.replace(/\/+$/, '')
  const apiKey = env.PASSPORT_API_KEY

  if (!baseUrl || !apiKey) {
    throw new Error(
      'cannot reconcile: PASSPORT_API_URL and PASSPORT_API_KEY must both be set. ' +
        'Refusing to run rather than reporting a clean pass over nothing.',
    )
  }

  const now = deps.now ?? Date.now
  const handlers = deps.handlers ?? passportSyncHandlers
  const client = deps.client ?? new PassportClient({ baseUrl, apiKey })

  const started = now()
  const snapshot = await client.snapshot()

  // FK-safe order — the same order `resyncOrg` uses. There are no foreign keys
  // between the projection's tables (events are out-of-order-safe by contract), so
  // this is about leaving the projection coherent at every intermediate point
  // rather than about satisfying constraints.
  for (const o of snapshot.organizations) await handlers.upsertOrg?.(o)
  for (const u of snapshot.units) await handlers.upsertUnit?.(u)
  for (const r of snapshot.unit_relations) await handlers.createRelation?.(r)
  for (const m of snapshot.memberships) await handlers.upsertMembership?.(m)
  for (const l of snapshot.identity_links) await handlers.createIdentityLink?.(l)
  for (const e of snapshot.entitlements) await handlers.upsertEntitlement?.(e)
  for (const a of snapshot.unit_app_accesses) await handlers.createUnitAppAccess?.(a)
  for (const r of snapshot.unit_app_memberships) await handlers.upsertUnitAppMembership?.(r)

  const summary: ReconcileSummary = {
    organizations: snapshot.organizations.length,
    units: snapshot.units.length,
    unitRelations: snapshot.unit_relations.length,
    memberships: snapshot.memberships.length,
    identityLinks: snapshot.identity_links.length,
    entitlements: snapshot.entitlements.length,
    unitAppAccesses: snapshot.unit_app_accesses.length,
    unitAppMemberships: snapshot.unit_app_memberships.length,
    durationMs: now() - started,
    empty: false,
  }

  summary.empty =
    summary.organizations +
      summary.units +
      summary.unitRelations +
      summary.memberships +
      summary.identityLinks +
      summary.entitlements +
      summary.unitAppAccesses +
      summary.unitAppMemberships ===
    0

  if (summary.empty) {
    // The signature of a missing or inactive entitlement, not of a healthy no-op —
    // and the two are otherwise indistinguishable from here. Say so, because
    // "reconciliation ran clean" over nothing is the most reassuring wrong
    // conclusion available.
    log?.warn(
      'passport reconcile: snapshot returned eight EMPTY collections. This is what a ' +
        'missing or inactive entitlement looks like — it is NOT evidence that the ' +
        'projection is correct. Verify with the Passport console.',
    )
  } else {
    // Counts only, never rows: the snapshot carries staff emails.
    log?.info('passport reconcile: applied', { ...summary })
  }

  return summary
}

// ---------------------------------------------------------------------------
// The schedule — part three, and the one most often missing
// ---------------------------------------------------------------------------
//
// Writing the function and stopping is the common failure: it passes its own unit
// test, so the suite is green and the write-up says "nightly reconciliation built"
// while nothing ever runs it, and the projection silently rots until somebody
// notices months of missed deliveries.
//
// **Single-instance**, and this adds no new constraint — `native-ws` realtime has
// pinned the server to one instance since 0.9.1, which is why `fly.toml` sets
// `min_machines_running = 1` and `auto_stop_machines = false`. Two instances would
// both reconcile; that is *safe* (every write is version-guarded or
// insert-if-absent) but it is twice the API calls. **The day a cross-instance
// realtime adapter lands, this timer needs moving** — recorded here so the reason
// is findable from the timer rather than only from the realtime module.

/**
 * Every six hours rather than every twenty-four.
 *
 * A 24-hour interval measured from boot is fragile in exactly this deployment: Fly
 * restarts the machine on every deploy, so on a repo that ships more than once a day
 * the timer would **never fire**. Six hours costs one extra API call per sweep and
 * cannot be defeated by an ordinary release cadence.
 */
export const RECONCILE_PERIOD_MS = 6 * 60 * 60 * 1000

/**
 * A first sweep shortly after boot, not immediately.
 *
 * Reconciling on startup is the useful half: a fresh environment, or one that was
 * down long enough for deliveries to exhaust their retries, converges without
 * waiting for the first interval. The delay lets the process finish starting first.
 */
export const RECONCILE_INITIAL_DELAY_MS = 60_000

export interface PassportReconciler {
  /** One sweep. Exported so a test never has to wait on a timer. */
  tick: () => Promise<void>
  start: () => void
  /** Stop sweeping, and wait for the sweep already in flight. */
  stop: () => Promise<void>
}

export function createPassportReconciler(
  deps: ReconcileDeps & { periodMs?: number; initialDelayMs?: number },
): PassportReconciler {
  const periodMs = deps.periodMs ?? RECONCILE_PERIOD_MS
  const initialDelayMs = deps.initialDelayMs ?? RECONCILE_INITIAL_DELAY_MS

  let interval: NodeJS.Timeout | null = null
  let initial: NodeJS.Timeout | null = null
  // The sweep in flight, or null. Holding the promise rather than a boolean is what
  // lets `stop()` await it — and it doubles as the overlap guard, so a manual
  // trigger arriving mid-sweep cannot start a second snapshot read.
  let sweep: Promise<void> | null = null

  async function runSweep(): Promise<void> {
    try {
      await reconcilePassportProjection(deps)
    } catch (err) {
      // A failed sweep must not take the process down: the receiver is the primary
      // path and keeps working. Logged rather than thrown, and loudly, because a
      // reconciliation that never succeeds is invisible otherwise.
      deps.log?.error('passport reconcile: sweep failed', {
        name: (err as Error).name,
        message: (err as Error).message,
      })
    }
  }

  async function tick(): Promise<void> {
    if (sweep) return sweep
    sweep = runSweep().finally(() => {
      sweep = null
    })
    return sweep
  }

  return {
    tick,
    start(): void {
      if (interval || initial) return
      initial = setTimeout(() => {
        initial = null
        void tick()
      }, initialDelayMs)
      // `unref` so a pending timer never holds the process open during shutdown.
      initial.unref?.()
      interval = setInterval(() => void tick(), periodMs)
      interval.unref?.()
    },
    async stop(): Promise<void> {
      if (initial) clearTimeout(initial)
      if (interval) clearInterval(interval)
      initial = null
      interval = null
      // Await the sweep already inside a snapshot read, for the same reason the
      // research ticker does: it would otherwise resume after `pool.end()` and
      // write against a dead pool.
      if (sweep) await sweep
    },
  }
}
