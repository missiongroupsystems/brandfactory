import { describe, expect, it, vi } from 'vitest'
import type { BrandStructure } from '@brandfactory/db'
import { createStructureResolver } from './structure'

/**
 * The resolver's three rules.
 *
 * Plan: phase 8c. Decision: proposal §8 `D1-b`.
 *
 * Every case here is a **silent** failure if it regresses. None of them throws, none renders
 * an error, and each looks like a small tidy-up in review:
 *
 * - `legalName ?? displayName` reads as defensive and prints a nickname into a legal field;
 * - `displayName: row.legalName` reads as "use the real name" and switches every picker in
 *   the app to "Pte. Ltd." on the day a brand links;
 * - a local `status` column reads as a performance fix for greying out archived brands.
 */

const LINKED: BrandStructure = {
  brandId: 'b-1',
  workspaceId: 'ws-1',
  displayName: 'Casa Vostra',
  unitId: 'u-1',
  organizationId: 'org-1',
  legalName: 'Casa Vostra Pte. Ltd.',
  unitStatus: 'active',
  unitType: 'brand',
}

const UNLINKED: BrandStructure = {
  brandId: 'b-2',
  workspaceId: 'ws-1',
  displayName: 'Made During An Outage',
  unitId: null,
  organizationId: 'org-1',
  legalName: null,
  unitStatus: null,
  unitType: null,
}

function resolver(rows: BrandStructure[]) {
  return createStructureResolver({
    getBrandStructure: vi.fn(async (id: string) => rows.find((r) => r.brandId === id)) as never,
    listBrandStructures: vi.fn(async () => rows) as never,
  })
}

describe('rule 1 — the display label is always ours', () => {
  it('uses `brands.name` for a LINKED brand, not the legal name', async () => {
    const brand = await resolver([LINKED]).brand('b-1')
    expect(brand?.displayName).toBe('Casa Vostra')
    // The whole point. Reading the legal name for display would silently rename every brand
    // in every picker, header, report and prompt on the day it links.
    expect(brand?.displayName).not.toBe('Casa Vostra Pte. Ltd.')
  })

  it('uses it for an UNLINKED brand too', async () => {
    const brand = await resolver([UNLINKED]).brand('b-2')
    expect(brand?.displayName).toBe('Made During An Outage')
  })
})

describe('rule 2 — a null legal name stays null', () => {
  it('exposes the legal name for a linked brand', async () => {
    const brand = await resolver([LINKED]).brand('b-1')
    expect(brand?.legalName).toBe('Casa Vostra Pte. Ltd.')
  })

  it('answers NULL for an unlinked brand rather than falling back to the label', async () => {
    // `legalName ?? displayName` is the tempting one-liner. It prints `Made During An Outage`
    // into a statutory field, and nothing anywhere errors.
    const brand = await resolver([UNLINKED]).brand('b-2')
    expect(brand?.legalName).toBeNull()
    expect(brand?.legalName).not.toBe('Made During An Outage')
  })
})

describe('rule 3 — status comes through the link only', () => {
  it('reads Passport’s status for a linked brand', async () => {
    expect((await resolver([LINKED]).brand('b-1'))?.status).toBe('active')
  })

  it('answers null for an unlinked brand, never a local default', async () => {
    // Not `'active'`. A local default is the shadow arriving: it makes `brands` carry a
    // Passport-owned fact, and it is wrong the moment Passport archives the unit.
    expect((await resolver([UNLINKED]).brand('b-2'))?.status).toBeNull()
  })
})

describe('the linked flag and the list', () => {
  it('derives `linked` from the unit id', async () => {
    expect((await resolver([LINKED]).brand('b-1'))?.linked).toBe(true)
    expect((await resolver([UNLINKED]).brand('b-2'))?.linked).toBe(false)
  })

  it('returns BOTH kinds from a workspace list', async () => {
    // ⚠️ The failure this exists for. An inner join returns nothing for a locally created
    // brand, so the brand list shows an empty page while the brand exists and is usable.
    const brands = await resolver([LINKED, UNLINKED]).brandsInWorkspace('ws-1')
    expect(brands.map((b) => b.brandId)).toEqual(['b-1', 'b-2'])
    expect(brands.filter((b) => !b.linked)).toHaveLength(1)
  })

  it('answers null for a brand that does not exist', async () => {
    expect(await resolver([LINKED]).brand('nope')).toBeNull()
  })

  it('carries the organisation even when the brand is unlinked', async () => {
    // The workspace can be linked while a brand under it is not — the ordinary state after an
    // outage. Losing the org here would break the unlinked access rule in 8d, which scopes to
    // exactly that organisation.
    expect((await resolver([UNLINKED]).brand('b-2'))?.organizationId).toBe('org-1')
  })
})
