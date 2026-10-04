import { describe, expect, it } from 'vitest'
import { canReadBrand, canWriteBrand, isActive, isAdmin, type AccessSubject } from './access'
import { BrandRoleSchema } from './role'

const ADMIN: AccessSubject = { role: 'admin', deactivatedAt: null }
const MEMBER: AccessSubject = { role: null, deactivatedAt: null }
const GONE: AccessSubject = { role: null, deactivatedAt: '2026-10-01T00:00:00.000Z' }
const GONE_ADMIN: AccessSubject = { role: 'admin', deactivatedAt: '2026-10-01T00:00:00.000Z' }

// The truth table the plan asked for. Every row is a case a route will meet.

describe('isActive', () => {
  it('is false the moment a deactivation stamp exists', () => {
    expect(isActive(MEMBER)).toBe(true)
    expect(isActive(GONE)).toBe(false)
  })
})

describe('isAdmin', () => {
  it('admits an active admin only', () => {
    expect(isAdmin(ADMIN)).toBe(true)
    expect(isAdmin(MEMBER)).toBe(false)
  })

  it('refuses a deactivated admin — withdrawn is withdrawn', () => {
    // Checked before the role, deliberately. An administrator whose access was
    // withdrawn must not keep the one privilege that could restore it.
    expect(isAdmin(GONE_ADMIN)).toBe(false)
  })
})

describe('canReadBrand', () => {
  it('admits an admin with no grant at all', () => {
    // Which is why `user_brands` holds no rows for an admin: the workspace
    // role already says it, and a row per brand would be a second place for
    // the same fact to drift.
    expect(canReadBrand(ADMIN, null)).toBe(true)
  })

  it('admits a member holding any grant', () => {
    for (const role of BrandRoleSchema.options) {
      expect(canReadBrand(MEMBER, role)).toBe(true)
    }
  })

  it('refuses a member with no grant — this is the door Phase C closes', () => {
    expect(canReadBrand(MEMBER, null)).toBe(false)
  })

  it('refuses a deactivated person however they are graded', () => {
    expect(canReadBrand(GONE, 'manager')).toBe(false)
    expect(canReadBrand(GONE_ADMIN, 'manager')).toBe(false)
  })
})

describe('canWriteBrand', () => {
  it('admits editor and manager, refuses viewer', () => {
    expect(canWriteBrand(MEMBER, 'viewer')).toBe(false)
    expect(canWriteBrand(MEMBER, 'editor')).toBe(true)
    expect(canWriteBrand(MEMBER, 'manager')).toBe(true)
  })

  it('admits an admin, refuses no grant and refuses a deactivation', () => {
    expect(canWriteBrand(ADMIN, null)).toBe(true)
    expect(canWriteBrand(MEMBER, null)).toBe(false)
    expect(canWriteBrand(GONE, 'manager')).toBe(false)
  })

  it('reads the ladder rather than listing the two values that pass', () => {
    // If a role is inserted into `BRAND_ROLE_ORDER` below `editor`, it must not
    // silently gain write access. This pins the comparison, not the outcome.
    const below = BrandRoleSchema.options.filter((r) => !canWriteBrand(MEMBER, r))
    expect(below).toEqual(['viewer'])
  })
})
