import { describe, expect, it, vi } from 'vitest'
import type { UnitPayload } from '@missiongroupsystems/passport-client'
import { createLogger } from '../logger'
import { createPassportSyncHandlers } from './handlers'
import { createBrandLinker } from './link-brand'

/**
 * The link that closes the `D1-b` round trip.
 *
 * Plan: 9c-bis. Decision: proposal §8 `D1-b`.
 *
 * ## What is worth asserting
 *
 * 1. **A local brand created during an outage actually links** when its unit arrives. Without
 *    this the whole decision is pointless: the brand works, is visible here, and is invisible
 *    to every sibling app for ever, with nothing failing.
 * 2. **A unit that is not ours is left alone.** Most deliveries are somebody else's units, so
 *    a linker that reacted to them would repoint brands at random.
 * 3. **The hook runs AFTER the projection write**, because the link joins to `passport.unit`.
 * 4. **It never throws.** A miss is ordinary traffic, and a throw makes Passport redeliver an
 *    event that applied perfectly.
 */

const BRAND = '33333333-3333-4333-8333-333333333333'
const UNIT = '99999999-9999-4999-8999-999999999999'

function unit(over: Partial<UnitPayload> = {}): UnitPayload {
  return {
    id: UNIT,
    organization_id: '11111111-1111-4111-8111-111111111111',
    type: 'brand',
    name: 'Casa Vostra Pte. Ltd.',
    external_ref: BRAND,
    status: 'active',
    version: 1,
    ...over,
  } as UnitPayload
}

const silent = createLogger({ level: 'error' })

describe('the brand linker', () => {
  it('links a local brand when its unit arrives', async () => {
    const link = vi.fn(async () => true)
    const { onUnitUpserted } = createBrandLinker({ link, log: silent })

    await onUnitUpserted(unit())

    expect(link).toHaveBeenCalledWith(BRAND, UNIT)
  })

  it('accepts the `brandfactory:` prefix an operator import may have used', async () => {
    // Strict in what we send — the push always sends the bare id — and liberal in what we
    // accept, because a unit imported under the original phase 8's convention must still
    // link rather than sit unmatched for ever.
    const link = vi.fn(async () => true)
    const { onUnitUpserted } = createBrandLinker({ link, log: silent })

    await onUnitUpserted(unit({ external_ref: `brandfactory:${BRAND}` }))

    expect(link).toHaveBeenCalledWith(BRAND, UNIT)
  })

  it('ignores a unit that carries no ref', async () => {
    // The common case by a wide margin: a unit created in the Passport console, or one that
    // belongs to a different consumer, arrives on every delivery.
    const link = vi.fn(async () => true)
    const { onUnitUpserted } = createBrandLinker({ link, log: silent })

    await onUnitUpserted(unit({ external_ref: null }))
    await onUnitUpserted(unit({ external_ref: undefined }))

    expect(link).not.toHaveBeenCalled()
  })

  it('ignores a ref belonging to another consumer', async () => {
    const link = vi.fn(async () => true)
    const { onUnitUpserted } = createBrandLinker({ link, log: silent })

    for (const ref of ['launchpad:42', 'ops-hub/abc', 'not-a-uuid', '', 'brandfactory:nope']) {
      await onUnitUpserted(unit({ external_ref: ref }))
    }

    expect(link).not.toHaveBeenCalled()
  })

  it('does not throw when the link fails', async () => {
    // The projection write has ALREADY committed by the time this runs, so a throw would make
    // Passport redeliver an event that applied perfectly — a retry loop over a correctly
    // stored unit. Recovery is the next delivery, or reconciliation's unmatched report.
    const link = vi.fn(async () => {
      throw new Error('connection reset')
    })
    const { onUnitUpserted } = createBrandLinker({ link, log: silent })

    await expect(onUnitUpserted(unit())).resolves.toBeUndefined()
  })

  it('does not throw when the brand is already linked', async () => {
    // An ordinary replay. `linkBrandToUnit`'s `WHERE … IS NULL` guard returns false, which is
    // the guard working rather than a problem.
    const link = vi.fn(async () => false)
    const { onUnitUpserted } = createBrandLinker({ link, log: silent })

    await expect(onUnitUpserted(unit())).resolves.toBeUndefined()
  })
})

describe('the receiver wires it in the right order', () => {
  it('projects the unit BEFORE linking', async () => {
    // The link joins to `passport.unit`, so the row must exist first. Reversed, the link
    // would find nothing on a brand-new unit and silently never happen — while every test
    // that stubs the database would still pass.
    const order: string[] = []
    const writer = {
      writeUnit: vi.fn(async () => {
        order.push('project')
      }),
    }
    const handlers = createPassportSyncHandlers(writer as never, {
      onUnitUpserted: async () => {
        order.push('link')
      },
    })

    await handlers.upsertUnit!(unit())

    expect(order).toEqual(['project', 'link'])
  })

  it('maps the payload to the row unchanged, hook or no hook', async () => {
    // The hook is additive. Adding it must not have altered what reaches the projection.
    const writeUnit = vi.fn(async () => undefined)
    const handlers = createPassportSyncHandlers({ writeUnit } as never, {})

    await handlers.upsertUnit!(unit({ uen: '201812345K' } as Partial<UnitPayload>))

    expect(writeUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: UNIT,
        name: 'Casa Vostra Pte. Ltd.',
        externalRef: BRAND,
        version: 1,
      }),
    )
  })

  it('links on `unit.archived` too, since it resolves to the same handler', async () => {
    // `archiveUnit` is `upsertUnit`. A brand whose unit was created and archived before the
    // event reached us must still link, or it is orphaned in the one case nobody tests.
    const onUnitUpserted = vi.fn(async () => undefined)
    const handlers = createPassportSyncHandlers(
      { writeUnit: vi.fn(async () => undefined) } as never,
      {
        onUnitUpserted,
      },
    )

    await handlers.archiveUnit!(unit({ status: 'archived' }))

    expect(onUnitUpserted).toHaveBeenCalled()
  })

  it('propagates a PROJECTION failure, unlike a link failure', async () => {
    // The asymmetry is the design. A failed projection write must make Passport redeliver;
    // a failed link must not.
    const handlers = createPassportSyncHandlers(
      {
        writeUnit: vi.fn(async () => {
          throw new Error('db down')
        }),
      } as never,
      { onUnitUpserted: vi.fn(async () => undefined) },
    )

    await expect(handlers.upsertUnit!(unit())).rejects.toThrow('db down')
  })
})
