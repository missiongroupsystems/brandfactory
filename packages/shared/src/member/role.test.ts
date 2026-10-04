import { describe, expect, it } from 'vitest'
import {
  BRAND_ROLE_ORDER,
  BrandRoleSchema,
  CredentialAuditActionSchema,
  WorkspaceRoleSchema,
} from './role'

// These tests pin the vocabularies against the pgEnums in
// `packages/db/src/schema/users.ts`, `user_brands.ts` and
// `credential_audit.ts`. A value added to one side and not the other is a
// runtime error at the wire boundary, which is the thing the convention
// exists to prevent.

describe('WorkspaceRoleSchema', () => {
  it('admits the one value it has', () => {
    expect(WorkspaceRoleSchema.parse('admin')).toBe('admin')
  })

  it('refuses anything else, which is the point of the enum', () => {
    // Launchpad stores the same thing as text, and an unrecognised value fell
    // through to *no admin access* — so editing a phone number revoked
    // somebody's administrator access with nothing said. Here the parse fails
    // and the database refuses the write.
    for (const bad of ['Admin', 'hr_manager', 'superadmin', 'member', '']) {
      expect(WorkspaceRoleSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('does not admit null — absence is the member case, not a value', () => {
    expect(WorkspaceRoleSchema.safeParse(null).success).toBe(false)
  })
})

describe('BrandRoleSchema', () => {
  it('admits the three degrees', () => {
    expect(BrandRoleSchema.options).toEqual(['viewer', 'editor', 'manager'])
  })

  it('refuses a value outside them', () => {
    for (const bad of ['owner', 'admin', 'read', 'Viewer']) {
      expect(BrandRoleSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('BRAND_ROLE_ORDER', () => {
  it('ascends, because `indexOf` is the comparison', () => {
    expect(BRAND_ROLE_ORDER.indexOf('viewer')).toBeLessThan(BRAND_ROLE_ORDER.indexOf('editor'))
    expect(BRAND_ROLE_ORDER.indexOf('editor')).toBeLessThan(BRAND_ROLE_ORDER.indexOf('manager'))
  })

  it('holds every role, so a comparison cannot silently return -1', () => {
    for (const role of BrandRoleSchema.options) {
      expect(BRAND_ROLE_ORDER).toContain(role)
    }
  })
})

describe('CredentialAuditActionSchema', () => {
  it('names both credential acts and membership changes', () => {
    expect(CredentialAuditActionSchema.options).toEqual([
      'set-on-create',
      'reset',
      'granted',
      'revoked',
      'role_changed',
      'deactivated',
      'reactivated',
    ])
  })

  it('has no action for a person setting their own password', () => {
    // Deliberate. The table logs admin acts on other people's credentials; a
    // person choosing their own password is not one, and a row for it would
    // make the table answer a different question than its name.
    for (const bad of ['self-set', 'changed', 'password_set']) {
      expect(CredentialAuditActionSchema.safeParse(bad).success).toBe(false)
    }
  })
})
