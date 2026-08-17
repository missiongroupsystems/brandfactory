import type { MembershipPayload } from '@missiongroupsystems/passport-client'
import type { User } from '@brandfactory/db'
import { describe, expect, it, vi } from 'vitest'
import { createPassportSyncHandlers, type PassportProjectionWriter } from './handlers'
import { createPassportOffboarding } from './offboard'

/**
 * Offboarding on `membership.removed`.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 7.
 */

const removed: MembershipPayload = {
  id: 'm-1',
  organization_id: 'org-1',
  platform_user_id: 'p-1',
  role: 'Member',
  status: 'removed',
  version: 2,
  email: 'Bob@Acme.test',
  display_name: 'Bob',
}

const user = (id: string, email: string): User =>
  ({ id, email, displayName: null, createdAt: '', updatedAt: '' }) as User

describe('passport offboarding', () => {
  it('closes the removed member’s live sockets', async () => {
    const disconnectUser = vi.fn(() => 1)
    const hooks = createPassportOffboarding({
      realtime: { disconnectUser },
      findUsers: async () => [user('u-1', 'bob@acme.test')],
    })

    await hooks.onMembershipRemoved(removed)

    // Keyed by the LOCAL user id, which is what sockets are registered under.
    expect(disconnectUser).toHaveBeenCalledWith('u-1')
  })

  // Sockets are keyed by whatever the bearer verifier resolved. For a hosted-login
  // session that is NOT `identity_link.subject` — which holds Passport's subject — so
  // walking the link table would find the wrong key, or none at all. Email is the one
  // identifier both sides hold.
  it('resolves through the payload’s embedded email, case-insensitively', async () => {
    const findUsers = vi.fn(async () => [user('u-1', 'bob@acme.test')])
    const hooks = createPassportOffboarding({
      realtime: { disconnectUser: () => 1 },
      findUsers,
    })

    await hooks.onMembershipRemoved(removed)

    // The projection stores the case Passport sent, which is not the case anybody
    // typed; `findUsersByEmail` compares case-insensitively.
    expect(findUsers).toHaveBeenCalledWith('Bob@Acme.test')
  })

  it('closes every local row for that address, not just the first', async () => {
    const disconnectUser = vi.fn(() => 1)
    const hooks = createPassportOffboarding({
      realtime: { disconnectUser },
      // Two case-variant rows are a real state in this schema. Leaving one connected
      // would be the whole bug.
      findUsers: async () => [user('u-1', 'bob@acme.test'), user('u-2', 'Bob@acme.test')],
    })

    await hooks.onMembershipRemoved(removed)

    expect(disconnectUser.mock.calls.flat()).toEqual(['u-1', 'u-2'])
  })

  it('is a no-op when the person has no local row, and does not throw', async () => {
    const disconnectUser = vi.fn(() => 0)
    const hooks = createPassportOffboarding({
      realtime: { disconnectUser },
      findUsers: async () => [],
    })

    await expect(hooks.onMembershipRemoved(removed)).resolves.toBeUndefined()
    expect(disconnectUser).not.toHaveBeenCalled()
  })

  it('logs counts and the org, never the email', async () => {
    const lines: unknown[] = []
    const hooks = createPassportOffboarding({
      realtime: { disconnectUser: () => 2 },
      findUsers: async () => [user('u-1', 'bob@acme.test')],
      log: {
        info: (msg: string, meta?: unknown) => lines.push({ msg, meta }),
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as never,
    })

    await hooks.onMembershipRemoved(removed)

    // The membership payload is staff PII, and this goes to the same log as everything
    // else.
    expect(JSON.stringify(lines)).not.toContain('Acme.test')
    expect(JSON.stringify(lines)).toContain('org-1')
    expect(JSON.stringify(lines)).toContain('"sockets":2')
  })
})

describe('the handler that calls it', () => {
  function writer() {
    const calls: string[] = []
    const record = (name: string) => async () => {
      calls.push(name)
    }
    return {
      calls,
      writer: {
        writeOrganization: record('writeOrganization'),
        writeUnit: record('writeUnit'),
        writeMembership: record('writeMembership'),
        writeEntitlement: record('writeEntitlement'),
        writeUnitAppMembership: record('writeUnitAppMembership'),
        writeUnitRelation: record('writeUnitRelation'),
        deleteUnitRelation: record('deleteUnitRelation'),
        writeIdentityLink: record('writeIdentityLink'),
        deleteIdentityLink: record('deleteIdentityLink'),
        writeUnitAppAccess: record('writeUnitAppAccess'),
        deleteUnitAppAccess: record('deleteUnitAppAccess'),
      } as PassportProjectionWriter,
    }
  }

  // The disconnect is only correct once the projection already says they are gone —
  // otherwise the client reconnects and is re-authorized against stale data, and walks
  // straight back into the channel it just lost.
  it('projects the tombstone BEFORE running the hook', async () => {
    const order: string[] = []
    const w = writer()
    const handlers = createPassportSyncHandlers(
      {
        ...w.writer,
        writeMembership: async () => {
          order.push('tombstone')
        },
      },
      {
        onMembershipRemoved: async () => {
          order.push('hook')
        },
      },
    )

    await handlers.removeMembership!(removed)
    expect(order).toEqual(['tombstone', 'hook'])
  })

  // A failed disconnect leaves a revoked person receiving events. Passport retries on a
  // non-2xx, and the retry retries the disconnect — so propagating is strictly better
  // than acking an event whose side effect failed.
  it('lets a hook failure PROPAGATE, so the delivery is retried', async () => {
    const w = writer()
    const handlers = createPassportSyncHandlers(w.writer, {
      onMembershipRemoved: async () => {
        throw new Error('bus unavailable')
      },
    })

    await expect(handlers.removeMembership!(removed)).rejects.toThrow('bus unavailable')
    // …and the tombstone still landed, so a retry is idempotent rather than a re-run
    // of half the work.
    expect(w.calls).toEqual(['writeMembership'])
  })

  it('still projects correctly with no hook supplied at all', async () => {
    const w = writer()
    const handlers = createPassportSyncHandlers(w.writer)

    await expect(handlers.removeMembership!(removed)).resolves.toBeUndefined()
    expect(w.calls).toEqual(['writeMembership'])
  })
})
