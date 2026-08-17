import { z } from 'zod'
import type { UnitRelationKind, UnitType } from './structure-write'

/**
 * What each unit type may carry, and what each may point at.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 9b.
 *
 * ---------------------------------------------------------------------------
 * These rules are Passport's, restated — not this app's, and not a second opinion
 * ---------------------------------------------------------------------------
 *
 * Passport enforces every rule below with database triggers and `422`s. Restating them
 * here buys one thing: **a field that cannot be saved is never offered, and never sent.**
 * A form that shows an address on a brand produces a save that fails every time for a
 * reason the person cannot see, and the `422` arrives as a whole-form error rather than
 * against the field that caused it.
 *
 * The direction of the duplication matters. This narrows what leaves the app; it never
 * widens it. If Passport tightens a rule, a request gets refused — visible, and correct.
 * If Passport *loosens* one, this stays narrow until somebody updates it, which is a
 * missing feature rather than a broken write. **What must never happen is this file
 * accepting something Passport refuses**, which is why every schema is `.strict()`.
 */

/**
 * An `entity` is a legal person, so it carries the statutory identifiers.
 *
 * `.strict()` rather than `.passthrough()`: an unknown key here would be forwarded to
 * Passport and answered with a `422` naming a field the person never typed.
 */
export const entityProfileSchema = z
  .object({
    uen: z.string().trim().max(64).optional(),
    gst_reg_no: z.string().trim().max(64).optional(),
    registered_address: z.string().trim().max(512).optional(),
  })
  .strict()

/** An `outlet` is a place, so it carries the place's details. */
export const outletProfileSchema = z
  .object({
    address: z.string().trim().max(512).optional(),
    postal: z.string().trim().max(32).optional(),
    contact_phone: z.string().trim().max(64).optional(),
    kind: z.string().trim().max(64).optional(),
  })
  .strict()

/**
 * A `brand` carries **no profile at all**.
 *
 * Not an oversight and not a gap to fill later: a brand is a concept, not a place and not
 * a legal person, so it has no address and no tax registration. An empty strict object is
 * the enforceable statement of that — `.optional()` on the whole profile would let
 * `{ address: … }` through to a `422`.
 */
export const brandProfileSchema = z.object({}).strict()

export const profileSchemaFor = (type: UnitType) => {
  switch (type) {
    case 'entity':
      return entityProfileSchema
    case 'outlet':
      return outletProfileSchema
    case 'brand':
      return brandProfileSchema
  }
}

/**
 * Which relations a unit of each type may **originate**.
 *
 * Direction is part of the rule: an outlet points at its brand, never the reverse. Passport
 * answers `422` for a pairing outside this table, including a correct pairing sent
 * backwards.
 */
export const RELATIONS_BY_TYPE: Record<UnitType, readonly UnitRelationKind[]> = {
  entity: [],
  brand: ['owned_by_entity'],
  outlet: ['belongs_to_brand', 'operated_by_entity'],
}

/** What the far end of each relation must be. */
export const RELATION_TARGET_TYPE: Record<UnitRelationKind, UnitType> = {
  owned_by_entity: 'entity',
  belongs_to_brand: 'brand',
  operated_by_entity: 'entity',
}

export function relationIsLegal(fromType: UnitType, relation: UnitRelationKind): boolean {
  return RELATIONS_BY_TYPE[fromType].includes(relation)
}

const unitName = z.string().trim().min(1).max(255)

/**
 * The create body. `type` is here and **only** here.
 *
 * A discriminated union rather than one shape with a `type` field, so the profile is
 * validated against the type in a single parse — the alternative parses the type, looks up
 * a schema, and parses again, which is the shape that grows a branch nobody checks.
 */
export const createUnitBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('entity'), name: unitName, profile: entityProfileSchema.optional() }),
  z.object({ type: z.literal('brand'), name: unitName, profile: brandProfileSchema.optional() }),
  z.object({ type: z.literal('outlet'), name: unitName, profile: outletProfileSchema.optional() }),
])

/**
 * The update body. **No `type`, and no `external_ref`.**
 *
 * `type` is immutable in Passport and `UnitUpdate` is `extra="forbid"`, so including it is
 * a `422` even when the value is unchanged — the shape that makes "I only renamed it" fail.
 * `external_ref` is phase 8's bridge key and this app's row resolution depends on it.
 *
 * The profile cannot be validated here, because the legal shape depends on the unit's
 * stored type. The route reads the type from the projection and validates against it.
 */
export const updateUnitBodySchema = z
  .object({
    name: unitName.optional(),
    profile: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.profile !== undefined, {
    message: 'Send at least one of name or profile.',
  })

export const attachRelationBodySchema = z
  .object({
    from_unit_id: z.string().uuid(),
    to_unit_id: z.string().uuid(),
    relation: z.enum(['owned_by_entity', 'belongs_to_brand', 'operated_by_entity']),
  })
  .strict()

/**
 * The org roles that may change structure, **read verbatim from Passport's vocabulary**
 * (rule 8).
 *
 * This is the **org** role, not the unit-app role. A brand `Manager` may not edit
 * structure — that is a role at a unit *within* this app, and treating the two vocabularies
 * as one ladder is exactly what rule 8 forbids. There is no `_ROLE_MAP` and no local
 * `is_admin` anywhere near this.
 */
export const STRUCTURE_WRITE_ROLES = ['Owner', 'Admin'] as const

export function canWriteStructure(orgRole: string | null | undefined): boolean {
  return orgRole === 'Owner' || orgRole === 'Admin'
}
