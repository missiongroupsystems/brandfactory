import type { StructureOperation } from '@brandfactory/db'
import type { StructureWriteClient, ActingPerson, StructureWriteFailure } from './structure-write'
import { isRetryable, structureWriteMessage } from './structure-write'

/**
 * Promote a locally created brand into a Passport unit.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, 8e + 9c-bis.
 * Decision: proposal §8 `D1-b` and §6.1.
 *
 * ---------------------------------------------------------------------------
 * Why promotion is a SEPARATE, Admin-gated action
 * ---------------------------------------------------------------------------
 *
 * `D1-b` splits the create in two, and the two halves cannot share a gate:
 *
 * | Path | Gate | Result |
 * | --- | --- | --- |
 * | Passport reachable | org `Owner`/`Admin`, hosted-login session | a real unit, immediately |
 * | Passport unreachable | whoever may create a brand in this app | a **local** brand |
 *
 * The local half cannot be Admin-and-hosted-login-only, because its whole purpose is to work
 * when hosted login does not. So a non-Admin can create a brand — and **only an Admin can
 * promote it**. Until an Admin acts, the brand exists in BrandFactory alone.
 *
 * That asymmetry is the security property. Letting a non-Admin's create reach Passport
 * unattended would hand a consumer app the power to add units to an organisation's structure
 * with no org Admin ever involved, and the unit would then be visible to every sibling app in
 * the suite.
 *
 * ---------------------------------------------------------------------------
 * `external_ref` is the brand's own id, and that is the whole mechanism
 * ---------------------------------------------------------------------------
 *
 * `UnitCreate.id` is super-admin only, so this app cannot choose the unit's UUID.
 * `external_ref` is the only place our identifier can travel — and because it is
 * `brands.id`, stable for the brand's whole life:
 *
 * - a replayed promotion is **idempotent**: Passport answers `409` on the second, rather
 *   than quietly creating a second unit;
 * - the returning `unit.upserted` can find the waiting local row (`link-brand.ts`).
 *
 * ---------------------------------------------------------------------------
 * Two calls, and the second is not optional
 * ---------------------------------------------------------------------------
 *
 * A unit carrying no `unit_app_access` row for BrandFactory confers access to **nobody** —
 * not even an org Owner. So a promotion that creates the unit and fails to switch the app on
 * produces a brand that Passport knows about and nobody here can see through the linked
 * rules. Worse than leaving it unlinked, because the local access rule stops applying the
 * moment the link lands.
 */

export interface PromoteBrandInput {
  person: ActingPerson
  organizationId: string
  /** `brands.id` — becomes `external_ref`, and the key the returning event links on. */
  brandId: string
  /** `brands.name`. Passport stores it as the unit's LEGAL name; ours stays the label. */
  name: string
  /** Always `'brand'` today. Passed explicitly so an outlet or entity is a caller decision. */
  type: 'entity' | 'brand' | 'outlet'
  /** Who is acting, for the queue's record. */
  attemptedBy: string
}

export type PromoteResult =
  | { ok: true; unitId: string }
  /** The unit exists but the app is not switched on at it. Visible to nobody. */
  | { ok: true; unitId: string; appAccessEnabled: false; message: string }
  | { ok: false; error: StructureWriteFailure; message: string; queued: boolean }

export interface PromoteDeps {
  client: StructureWriteClient
  /** Records a retryable failure. Nothing else reads the queue. */
  record: (input: {
    organizationId: string
    operation: StructureOperation
    payload: unknown
    unitId?: string | null
    attemptedBy: string
    lastError: string
  }) => Promise<unknown>
}

export function createBrandPromoter(deps: PromoteDeps) {
  return async function promoteBrand(input: PromoteBrandInput): Promise<PromoteResult> {
    // `"<app>:<legacy pk>"` — the convention the migration reference specifies. The prefix
    // makes an unmatched ref attributable to BrandFactory in the Passport console rather than
    // anonymous. `link-brand.ts` accepts both this and a bare id, so a unit imported by hand
    // under either form still links.
    const externalRef = `brandfactory:${input.brandId}`
    const payload = { name: input.name, type: input.type, externalRef }

    const created = await deps.client.createUnit(input.person, input.organizationId, {
      name: input.name,
      type: input.type,
      externalRef,
    })

    if (!created.ok) {
      const message = structureWriteMessage(created.error)
      const queued = isRetryable(created.error)
      if (queued) {
        await deps.record({
          organizationId: input.organizationId,
          operation: 'unit.create',
          payload,
          unitId: null,
          attemptedBy: input.attemptedBy,
          lastError: message,
        })
      }
      // The brand is untouched and still usable. A failed promotion is not a failed create.
      return { ok: false, error: created.error, message, queued }
    }

    const unitId = created.value.id
    const enabled = await deps.client.enableApp(input.person, input.organizationId, unitId)
    if (!enabled.ok) {
      const message = structureWriteMessage(enabled.error)
      if (isRetryable(enabled.error)) {
        await deps.record({
          organizationId: input.organizationId,
          operation: 'unit_app_access.enable',
          payload: { unitId },
          unitId,
          attemptedBy: input.attemptedBy,
          lastError: message,
        })
      }
      // NOT rolled back. The unit exists in Passport and sibling apps may already hold the
      // event; archiving it to tidy up our own half-failure would be a destructive write
      // nobody asked for.
      return {
        ok: true,
        unitId,
        appAccessEnabled: false,
        message: `The brand now exists in Mission Passport, but BrandFactory could not be switched on at it: ${message}`,
      }
    }

    return { ok: true, unitId }
  }
}

export type BrandPromoter = ReturnType<typeof createBrandPromoter>
