import { linkBrandToUnit, localBrandIdFromExternalRef } from '@brandfactory/db'
import type { UnitPayload } from '@missiongroupsystems/passport-client'
import type { Logger } from '../logger'
import type { PassportSyncHooks } from './handlers'

/**
 * Close the round trip: a brand created here becomes a unit there, and the returning event
 * joins the two.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, 9c-bis. Decision: proposal §8 `D1-b`.
 *
 * ```
 *   1. local create        brands row exists, passport_unit_id NULL, brand USABLE
 *   2. push (queued while Passport is down)   external_ref = brands.id
 *   3. Passport 201  ->  unit.upserted
 *   4. THIS            brands.passport_unit_id = unit.id
 * ```
 *
 * ---------------------------------------------------------------------------
 * Step 4 is the only moment the two records can be joined
 * ---------------------------------------------------------------------------
 *
 * Passport does not know it created a unit *for an existing local brand* — from its side this
 * is an ordinary create. The only thing carrying that knowledge is `external_ref`, and the
 * only thing that can act on it is this app. Miss the event and the brand stays unlinked for
 * ever, with nothing failing: it works, it is visible here, and it is invisible to every
 * sibling app.
 *
 * ---------------------------------------------------------------------------
 * Every branch logs, and NONE of them throws
 * ---------------------------------------------------------------------------
 *
 * Three of the four outcomes below are not this app's business — a unit created in the
 * Passport console, or one belonging to another consumer, arrives here on every delivery. So
 * a miss is normal traffic, and throwing would make Passport retry an event that was applied
 * perfectly.
 *
 * The fourth — a ref that looks like ours and matches nothing — is the failure mode recorded
 * in proposal `D1`. It is **logged rather than repaired**, because the repair is a human
 * decision about which of two records is real. `listUnmatchedUnitRefs` reports it in bulk.
 *
 * That does mean the projection write is the only thing that can fail this handler, which is
 * correct: this hook is a convenience join, not a projection guarantee.
 */
export interface LinkBrandDeps {
  log?: Logger
  /** Injectable so the hook can be tested with no database. */
  link?: typeof linkBrandToUnit
}

export function createBrandLinker(
  deps: LinkBrandDeps = {},
): Pick<Required<PassportSyncHooks>, 'onUnitUpserted'> {
  const link = deps.link ?? linkBrandToUnit

  return {
    async onUnitUpserted(payload: UnitPayload): Promise<void> {
      // Accepts the bare id we send and the `brandfactory:<id>` form an operator import may
      // have used. Anything else is another party's ref and is not ours to interpret.
      const brandId = localBrandIdFromExternalRef(payload.external_ref)
      if (!brandId) return

      try {
        const linked = await link(brandId, payload.id)
        if (linked) {
          deps.log?.info('passport: linked a local brand to its unit', {
            brandId,
            unitId: payload.id,
          })
          return
        }
        // Either the brand is already linked — an ordinary replay, and the `WHERE … IS NULL`
        // guard doing its job — or the ref names a brand that does not exist here. The two
        // are worth telling apart, but not at the cost of a second query on every delivery:
        // `listUnmatchedUnitRefs` answers it in bulk from reconciliation.
        deps.log?.debug('passport: unit ref matched no unlinked local brand', {
          brandId,
          unitId: payload.id,
        })
      } catch (err) {
        // Deliberately swallowed, and this is the one swallow in the receiver.
        //
        // Everywhere else an error must propagate so Passport redelivers, because the
        // projection would otherwise lose the event. Here the projection write has ALREADY
        // committed — this hook runs after it — so redelivering buys nothing but a retry
        // loop on a unit that is correctly stored. A brand that failed to link is recovered
        // by the next delivery for that unit, or reported by reconciliation.
        deps.log?.warn('passport: failed to link a local brand to its unit', {
          brandId,
          unitId: payload.id,
          message: (err as Error).message,
        })
      }
    },
  }
}
