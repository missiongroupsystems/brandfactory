import { z } from 'zod'
import { BrandIdSchema, UserIdSchema } from '../ids'
import { PasswordSchema } from './password'
import { BrandRoleSchema, WorkspaceRoleSchema } from './role'

/**
 * The wire shapes for `/members`. The plan is
 * `docs/completions/members-passwords-and-brand-access-plan.md`.
 */

/**
 * ⚠️ **`viewer` is refused, deliberately, and this is the enforcement point.**
 *
 * The column holds three roles and the server enforces only *presence* of a
 * grant — `canWriteBrand` is written and no route calls it, because enforcing
 * it needs a write gate on every mutating route. Until that exists, storing a
 * `viewer` grant would record a restriction nothing applies: somebody would set
 * it, believe writes were blocked, and be wrong.
 *
 * So the vocabulary stays whole in the database and the wire refuses the one
 * value whose meaning is not yet real. Delete this and the enum opens itself.
 */
export const GrantableBrandRoleSchema = BrandRoleSchema.refine((r) => r !== 'viewer', {
  message: 'viewer access is not available yet — per-role write rules are not built',
})

export const BrandGrantSchema = z.object({
  brandId: BrandIdSchema,
  role: GrantableBrandRoleSchema,
})
export type BrandGrant = z.infer<typeof BrandGrantSchema>

export const MemberSummarySchema = z.object({
  id: UserIdSchema,
  email: z.string(),
  displayName: z.string().nullable(),
  role: WorkspaceRoleSchema.nullable(),
  mustSetPassword: z.boolean(),
  deactivatedAt: z.string().nullable(),
  createdAt: z.string(),
  brands: z.array(
    z.object({ brandId: BrandIdSchema, brandName: z.string(), role: BrandRoleSchema }),
  ),
})
export type MemberSummary = z.infer<typeof MemberSummarySchema>

export const CreateMemberSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  displayName: z.string().trim().min(1).max(120).nullable().optional(),
  role: WorkspaceRoleSchema.nullable().optional(),
  /**
   * The first password, chosen by the administrator and generated in their
   * browser. Optional because the local dev provider holds no passwords —
   * `AuthProvider.holdsPasswords` decides whether the route needs one.
   */
  password: PasswordSchema.optional(),
  brands: z.array(BrandGrantSchema).default([]),
})
export type CreateMemberInput = z.infer<typeof CreateMemberSchema>

export const UpdateMemberSchema = z.object({
  displayName: z.string().trim().min(1).max(120).nullable().optional(),
  role: WorkspaceRoleSchema.nullable().optional(),
  brands: z.array(BrandGrantSchema).optional(),
})
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>

export const ResetPasswordSchema = z.object({ password: PasswordSchema })
