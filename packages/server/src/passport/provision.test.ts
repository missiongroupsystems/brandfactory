import type { User } from '@brandfactory/db'
import { describe, expect, it, vi } from 'vitest'
import { createPassportProvisioner } from './provision'

/**
 * Resolving — or provisioning — the local `users` row behind a Passport token.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6c.
 *
 * Three rules, each of which has bitten a real consumer, and each silent when broken.
 */

const user = (id: string, email: string): User =>
  ({ id, email, displayName: null, createdAt: '', updatedAt: '' }) as User

const membership = {
  role: 'Member',
  status: 'active',
  organizationId: 'org-1',
  platformUserId: 'p-1',
  email: 'bob@acme.test',
  displayName: 'Bob',
}

const activeMember = { membershipForEmail: async () => ({ ok: true, membership }) as never }
const noMember = { membershipForEmail: async () => ({ ok: false, reason: 'none' }) as never }

describe('passport user provisioning', () => {
  it('returns the existing local row without minting anything', async () => {
    const create = vi.fn()
    const resolve = createPassportProvisioner({
      access: activeMember,
      findUsers: async () => [user('u-1', 'Bob@Acme.test')],
      create,
    })

    const result = await resolve('bob@acme.test')
    expect(result).toEqual({ ok: true, user: user('u-1', 'Bob@Acme.test'), provisioned: false })
    expect(create).not.toHaveBeenCalled()
  })

  // Rule 1, and the reason it is not merely tidier: resolving by the Passport `sub`
  // would try to insert a row whose id is a foreign project's subject and whose email
  // already exists — violating the `users.email` unique index. The adapter swallows
  // that, the lookup misses, and the person gets a 404 from `/me` with a valid token.
  it('matches case-insensitively, so a differently-cased row is found not duplicated', async () => {
    const create = vi.fn()
    const findUsers = vi.fn(async () => [user('u-1', 'BOB@ACME.TEST')])
    const resolve = createPassportProvisioner({ access: activeMember, findUsers, create })

    const result = await resolve('bob@acme.test')
    expect(result).toMatchObject({ ok: true, provisioned: false })
    expect(create).not.toHaveBeenCalled()
  })

  // Rule 2. `users.email` is unique but not case-insensitively so, so two variants can
  // exist. On a path that hands out a session, picking "the first one" silently
  // authenticates somebody as the WRONG PERSON.
  it('fails CLOSED on two case-variant rows rather than guessing', async () => {
    const create = vi.fn()
    const resolve = createPassportProvisioner({
      access: activeMember,
      findUsers: async () => [user('u-1', 'bob@acme.test'), user('u-2', 'Bob@acme.test')],
      create,
    })

    expect(await resolve('bob@acme.test')).toEqual({ ok: false, reason: 'ambiguous_email' })
    expect(create).not.toHaveBeenCalled()
  })

  it('provisions for an active member with no local row yet', async () => {
    const create = vi.fn(async () => user('u-new', 'bob@acme.test'))
    const resolve = createPassportProvisioner({
      access: activeMember,
      findUsers: async () => [],
      create,
    })

    const result = await resolve('bob@acme.test')
    expect(result).toMatchObject({ ok: true, provisioned: true })
    // The display name comes from the membership projection, which is where Passport
    // put it — not from a token claim.
    expect(create).toHaveBeenCalledWith({ email: 'bob@acme.test', displayName: 'Bob' })
  })

  // Rule 3. A valid Passport token proves who somebody is, not that they belong here.
  // Minting a row for a non-member creates an account nobody authorised.
  it('NEVER provisions for a non-member', async () => {
    const create = vi.fn()
    const resolve = createPassportProvisioner({
      access: noMember,
      findUsers: async () => [],
      create,
    })

    expect(await resolve('stranger@example.test')).toEqual({ ok: false, reason: 'not_a_member' })
    expect(create).not.toHaveBeenCalled()
  })

  it('reports an ambiguous MEMBERSHIP as ambiguous, not as absent', async () => {
    const resolve = createPassportProvisioner({
      access: { membershipForEmail: async () => ({ ok: false, reason: 'ambiguous' }) as never },
      findUsers: async () => [],
      create: vi.fn(),
    })

    // Two case-variant memberships in the projection is an operator problem to see,
    // not something to resolve arbitrarily.
    expect(await resolve('bob@acme.test')).toEqual({ ok: false, reason: 'ambiguous_email' })
  })

  // An existing local row short-circuits the membership check, which is what makes the
  // callback's separate gate load-bearing: a REMOVED member who still owns a legacy row
  // resolves fine HERE and must be refused THERE.
  it('does not check membership when a local row already exists', async () => {
    const membershipForEmail = vi.fn()
    const resolve = createPassportProvisioner({
      access: { membershipForEmail } as never,
      findUsers: async () => [user('u-1', 'bob@acme.test')],
      create: vi.fn(),
    })

    await resolve('bob@acme.test')
    expect(membershipForEmail).not.toHaveBeenCalled()
  })
})
