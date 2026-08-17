import type { Snapshot, SyncHandlers } from '@missiongroupsystems/passport-client'
import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { createLogger, type Logger } from '../logger'
import { createPassportReconciler, reconcilePassportProjection } from './reconcile'

// Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 5.

function env(over: Partial<Env> = {}): Env {
  return { PASSPORT_API_URL: 'https://passport-api.test', PASSPORT_API_KEY: 'pk', ...over } as Env
}

function captured(): { log: Logger; lines: string[] } {
  const lines: string[] = []
  return {
    lines,
    log: createLogger({ level: 'debug', write: (line) => lines.push(JSON.stringify(line)) }),
  }
}

const EMPTY: Snapshot = {
  organizations: [],
  units: [],
  unit_relations: [],
  memberships: [],
  identity_links: [],
  entitlements: [],
  unit_app_accesses: [],
  unit_app_memberships: [],
}

const ORG = { id: 'o1', name: 'Org', slug: 'org', status: 'active', version: 1 }
const UNIT = {
  id: 'u1',
  organization_id: 'o1',
  type: 'brand',
  name: 'Brand',
  external_ref: null,
  status: 'active',
  version: 1,
  uen: null,
  gst_reg_no: null,
  registered_address: null,
  address: null,
  postal: null,
  contact_phone: null,
  kind: null,
}
const REL = {
  id: 'r1',
  organization_id: 'o1',
  from_unit_id: 'u2',
  to_unit_id: 'u1',
  relation: 'belongs_to_brand',
}
const MEMBER = {
  id: 'm1',
  organization_id: 'o1',
  platform_user_id: 'p1',
  role: 'Owner',
  status: 'active',
  version: 1,
  email: 'bob@acme.test',
  display_name: null,
}
const LINK = {
  id: 'l1',
  platform_user_id: 'p1',
  app_id: 'a1',
  subject: 's1',
  linked_via: 'email_match',
}
const ENT = {
  id: 'e1',
  organization_id: 'o1',
  app_id: 'a1',
  status: 'active',
  tier: null,
  source: 'admin',
  version: 1,
}
const UAA = { id: 'x1', organization_id: 'o1', unit_id: 'u1', app_id: 'a1' }
const UAM = {
  id: 'z1',
  organization_id: 'o1',
  platform_user_id: 'p1',
  unit_id: 'u1',
  app_id: 'a1',
  role: 'Manager',
  status: 'active',
  version: 1,
}

const FULL: Snapshot = {
  organizations: [ORG],
  units: [UNIT],
  unit_relations: [REL],
  memberships: [MEMBER],
  identity_links: [LINK],
  entitlements: [ENT],
  unit_app_accesses: [UAA],
  unit_app_memberships: [UAM],
}

/** Records which handler ran, in order. */
function recording(): { handlers: SyncHandlers; calls: string[] } {
  const calls: string[] = []
  const h = (name: string) => async () => {
    calls.push(name)
  }
  return {
    calls,
    handlers: {
      upsertOrg: h('upsertOrg'),
      upsertUnit: h('upsertUnit'),
      createRelation: h('createRelation'),
      upsertMembership: h('upsertMembership'),
      createIdentityLink: h('createIdentityLink'),
      upsertEntitlement: h('upsertEntitlement'),
      createUnitAppAccess: h('createUnitAppAccess'),
      upsertUnitAppMembership: h('upsertUnitAppMembership'),
      removeMembership: h('removeMembership'),
      removeRelation: h('removeRelation'),
      removeIdentityLink: h('removeIdentityLink'),
      removeUnitAppAccess: h('removeUnitAppAccess'),
      removeUnitAppMembership: h('removeUnitAppMembership'),
    },
  }
}

describe('passport reconciliation', () => {
  it('applies every collection in FK-safe order', async () => {
    const { handlers, calls } = recording()
    await reconcilePassportProjection({
      env: env(),
      handlers,
      client: { snapshot: async () => FULL },
    })

    // Order is about leaving the projection coherent at every intermediate point,
    // not about constraints — there are deliberately none between these tables.
    expect(calls).toEqual([
      'upsertOrg',
      'upsertUnit',
      'createRelation',
      'upsertMembership',
      'createIdentityLink',
      'upsertEntitlement',
      'createUnitAppAccess',
      'upsertUnitAppMembership',
    ])
  })

  // The single most dangerous thing this job could do. The snapshot's
  // `identity_links` are a per-org SUBSET and never authoritative — and this app
  // writes its OWN link rows at login, with subjects Passport does not know. A
  // pruning reconciler deletes exactly the rows that make sessions resolve, and the
  // app denies everyone the next morning.
  it('NEVER deletes — it converges by upsert only', async () => {
    const { handlers, calls } = recording()
    await reconcilePassportProjection({
      env: env(),
      handlers,
      client: { snapshot: async () => FULL },
    })

    expect(calls.filter((c) => c.startsWith('remove'))).toEqual([])
  })

  it('re-applies through the receiver’s own handlers, not a second write path', async () => {
    // Asserted by shape: a parallel implementation would drift from the version
    // guard and the tombstone rules, and the drift would only show under replay.
    const { handlers, calls } = recording()
    await reconcilePassportProjection({
      env: env(),
      handlers,
      client: { snapshot: async () => ({ ...EMPTY, memberships: [MEMBER] }) },
    })

    expect(calls).toEqual(['upsertMembership'])
  })

  it('counts every collection in the summary', async () => {
    const summary = await reconcilePassportProjection({
      env: env(),
      handlers: recording().handlers,
      client: { snapshot: async () => FULL },
      now: () => 1000,
    })

    expect(summary).toMatchObject({
      organizations: 1,
      units: 1,
      unitRelations: 1,
      memberships: 1,
      identityLinks: 1,
      entitlements: 1,
      unitAppAccesses: 1,
      unitAppMemberships: 1,
      durationMs: 0,
      empty: false,
    })
  })

  describe('an empty snapshot', () => {
    // With no active entitlement the snapshot returns eight empty collections
    // whether or not anything is wrong — which is this app's exact state today. So
    // "reconciliation ran clean" over nothing is the most reassuring available wrong
    // conclusion, and it has to be called out.
    it('is flagged and warned about, never reported as a healthy no-op', async () => {
      const { log, lines } = captured()
      const summary = await reconcilePassportProjection({
        env: env(),
        log,
        handlers: recording().handlers,
        client: { snapshot: async () => EMPTY },
      })

      expect(summary.empty).toBe(true)
      expect(lines.join(' ')).toMatch(/eight EMPTY collections/)
      expect(lines.join(' ')).toMatch(/NOT evidence that the projection is correct/)
    })

    it('deletes nothing, so an empty snapshot cannot empty the projection', async () => {
      const { handlers, calls } = recording()
      await reconcilePassportProjection({
        env: env(),
        handlers,
        client: { snapshot: async () => EMPTY },
      })

      expect(calls).toEqual([])
    })
  })

  describe('refusing rather than reporting a clean pass over nothing', () => {
    it('throws when the API credentials are missing', async () => {
      for (const over of [
        { PASSPORT_API_URL: undefined },
        { PASSPORT_API_KEY: undefined },
      ] as Partial<Env>[]) {
        await expect(
          reconcilePassportProjection({ env: env(over), handlers: recording().handlers }),
        ).rejects.toThrow(/PASSPORT_API_URL and PASSPORT_API_KEY/)
      }
    })

    it('propagates an API failure instead of swallowing it', async () => {
      // Silently succeeding on an unreachable Passport makes a broken
      // reconciliation indistinguishable from a clean one.
      await expect(
        reconcilePassportProjection({
          env: env(),
          handlers: recording().handlers,
          client: {
            snapshot: async () => {
              throw new Error('503 from Passport')
            },
          },
        }),
      ).rejects.toThrow('503 from Passport')
    })
  })

  it('logs counts only, never rows', async () => {
    const { log, lines } = captured()
    await reconcilePassportProjection({
      env: env(),
      log,
      handlers: recording().handlers,
      client: { snapshot: async () => FULL },
    })

    // The snapshot carries staff emails. A count is safe to log; a row is not.
    expect(lines.join(' ')).not.toMatch(/bob@acme\.test/)
    expect(lines.join(' ')).toMatch(/passport reconcile: applied/)
  })

  describe('the schedule', () => {
    it('sweeps on tick, without waiting for a timer', async () => {
      const snapshot = vi.fn(async () => EMPTY)
      const reconciler = createPassportReconciler({
        env: env(),
        handlers: recording().handlers,
        client: { snapshot },
      })

      await reconciler.tick()
      expect(snapshot).toHaveBeenCalledTimes(1)
    })

    // A manual trigger arriving mid-sweep must not start a second snapshot read.
    it('coalesces overlapping sweeps', async () => {
      let release: (() => void) | undefined
      const snapshot = vi.fn(async () => {
        await new Promise<void>((r) => {
          release = r
        })
        return EMPTY
      })
      const reconciler = createPassportReconciler({
        env: env(),
        handlers: recording().handlers,
        client: { snapshot },
      })

      const first = reconciler.tick()
      const second = reconciler.tick()
      release?.()
      await Promise.all([first, second])

      expect(snapshot).toHaveBeenCalledTimes(1)
    })

    // A failed sweep must not take the process down: the receiver is the primary
    // path and keeps working. But it must be loud, because a reconciliation that
    // never succeeds is otherwise invisible.
    it('logs a failed sweep rather than throwing out of the timer', async () => {
      const { log, lines } = captured()
      const reconciler = createPassportReconciler({
        env: env(),
        log,
        handlers: recording().handlers,
        client: {
          snapshot: async () => {
            throw new Error('network down')
          },
        },
      })

      await expect(reconciler.tick()).resolves.toBeUndefined()
      expect(lines.join(' ')).toMatch(/sweep failed/)
      expect(lines.join(' ')).toMatch(/network down/)
    })

    it('runs an initial sweep shortly after start, then on the interval', async () => {
      vi.useFakeTimers()
      try {
        const snapshot = vi.fn(async () => EMPTY)
        const reconciler = createPassportReconciler({
          env: env(),
          handlers: recording().handlers,
          client: { snapshot },
          initialDelayMs: 1000,
          periodMs: 5000,
        })

        reconciler.start()
        expect(snapshot).not.toHaveBeenCalled()

        // The initial sweep is what makes a fresh environment — or one that was down
        // long enough for deliveries to exhaust their retries — converge without
        // waiting a full period.
        await vi.advanceTimersByTimeAsync(1000)
        expect(snapshot).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(5000)
        expect(snapshot).toHaveBeenCalledTimes(2)

        await reconciler.stop()
        await vi.advanceTimersByTimeAsync(20_000)
        expect(snapshot).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('start is idempotent, so a double call cannot double the sweeps', async () => {
      vi.useFakeTimers()
      try {
        const snapshot = vi.fn(async () => EMPTY)
        const reconciler = createPassportReconciler({
          env: env(),
          handlers: recording().handlers,
          client: { snapshot },
          initialDelayMs: 1000,
          periodMs: 5000,
        })

        reconciler.start()
        reconciler.start()
        await vi.advanceTimersByTimeAsync(1000)
        expect(snapshot).toHaveBeenCalledTimes(1)

        await reconciler.stop()
      } finally {
        vi.useRealTimers()
      }
    })

    // Same reason the research ticker awaits its sweep: one sitting inside a
    // snapshot read would otherwise resume after `pool.end()` and write against a
    // dead pool.
    it('stop awaits the sweep already in flight', async () => {
      let release: (() => void) | undefined
      let finished = false
      const reconciler = createPassportReconciler({
        env: env(),
        handlers: recording().handlers,
        client: {
          snapshot: async () => {
            await new Promise<void>((r) => {
              release = r
            })
            finished = true
            return EMPTY
          },
        },
      })

      void reconciler.tick()
      const stopping = reconciler.stop()
      expect(finished).toBe(false)
      release?.()
      await stopping
      expect(finished).toBe(true)
    })
  })
})
