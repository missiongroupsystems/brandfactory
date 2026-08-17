import { getBrandStructure, listBrandStructures, type BrandStructure } from '@brandfactory/db'

/**
 * The one place that answers "what is this brand, in both systems?"
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 8c.
 * Decision: proposal §8 `D1-b`.
 *
 * ---------------------------------------------------------------------------
 * Why this sits here and not in `packages/adapters/structure`
 * ---------------------------------------------------------------------------
 *
 * The plan said to build it as a sixth adapter port. **That was wrong and it was not
 * built.** Each of the five existing ports exists to swap a vendor — `local-disk` against
 * Supabase storage, `native-ws` against a hosted bus. This swaps nothing: `D1-b`'s refined
 * design has no "local mode" and no "Passport mode", only rows that are linked and rows that
 * are not, and both are answered by the same query. A port with one implementation and
 * nothing to substitute is ceremony that makes the code look more configurable than it is.
 *
 * It lives beside `authz.ts` because that is its principal consumer and the two are read
 * together.
 *
 * ---------------------------------------------------------------------------
 * The three rules, each of which fails silently
 * ---------------------------------------------------------------------------
 *
 * 1. **`displayName` always comes from `brands.name`** — for every brand, linked or not. It
 *    is the app's own label and it may differ from the legal name for ever. Reading
 *    `passport.unit.name` for display is the drift: every picker and header would silently
 *    switch to "Pte. Ltd." names on the day a brand links.
 * 2. **`legalName` is `null` when unlinked, and is NEVER defaulted to the display label.** A
 *    surface that needs a legal name — statutory output, a cross-app reference — must handle
 *    the null. Defaulting prints a nickname into a legal field, and nothing errors.
 * 3. **`status` is Passport's and is read through the link only.** Never copied onto
 *    `brands`. A local `status` column is the most likely shadow to be added here, because
 *    "the list needs to grey out archived brands" is a reasonable-sounding request with a
 *    reasonable-sounding one-line implementation.
 */

export interface ResolvedBrand {
  brandId: string
  workspaceId: string
  /** `brands.name`. The label staff read. Always present. */
  displayName: string
  /** `passport.unit.name`. The legal name. **Null when Passport does not know this brand.** */
  legalName: string | null
  /** The Passport unit, or null. */
  unitId: string | null
  /** The workspace's Passport organisation, or null. */
  organizationId: string | null
  /** Passport's status, through the link. Null when unlinked. */
  status: string | null
  /** Convenience for the three call sites that branch on it. `unitId !== null`. */
  linked: boolean
}

function toResolved(row: BrandStructure): ResolvedBrand {
  return {
    brandId: row.brandId,
    workspaceId: row.workspaceId,
    // Rule 1. Never `row.legalName ?? row.displayName`, and never the other way round.
    displayName: row.displayName,
    // Rule 2. Null stays null.
    legalName: row.legalName,
    unitId: row.unitId,
    organizationId: row.organizationId,
    // Rule 3.
    status: row.unitStatus,
    linked: row.unitId !== null,
  }
}

export interface StructureDeps {
  getBrandStructure: typeof getBrandStructure
  listBrandStructures: typeof listBrandStructures
}

export const realStructureReader: StructureDeps = {
  getBrandStructure,
  listBrandStructures,
}

export function createStructureResolver(deps: StructureDeps = realStructureReader) {
  return {
    async brand(brandId: string): Promise<ResolvedBrand | null> {
      const row = await deps.getBrandStructure(brandId)
      return row ? toResolved(row) : null
    },

    async brandsInWorkspace(workspaceId: string): Promise<ResolvedBrand[]> {
      const rows = await deps.listBrandStructures(workspaceId)
      return rows.map(toResolved)
    },
  }
}

export type StructureResolver = ReturnType<typeof createStructureResolver>
