import {
  byPosition,
  type AssetKind,
  type AssetLibrary,
  type AssetRole,
  type BrandAsset,
} from './asset'

// ---------------------------------------------------------------------------
// The fourth axis: which shelf an asset is filed on
// ---------------------------------------------------------------------------
//
// `AssetLibrarySchema` itself is in `./asset.ts` with the three axes it is a
// peer of — see the comment there for why the enum and its rule are in
// different files. What lives here is the rule and the reader.
//
// The library is one library with three shelves, not three libraries:
//
//   identity     marks · palette · typefaces — what a brand settles
//   photography  what a brand accumulates
//   collateral   printable things and files
//
// Before this column the three were *derived* from `kind` and `role`, which is
// an approximation that misfiles every ordinary case where purpose and bytes
// disagree: a printable menu exported as a PNG is a photograph by that rule,
// and a logo lockup delivered as a PDF is a file. Filing is a human judgement,
// and the only place a judgement can live is a column.

/**
 * Where a new asset goes when nobody said.
 *
 * **This function has exactly two callers, and they are the two that matter:**
 *
 * 1. Migration 0010's backfill, mirrored as a `CASE` expression in SQL.
 * 2. `POST /brands/:id/assets` when the body omits `library` — which is what
 *    lets every client that predates the column keep working unchanged, and is
 *    why the wire field is optional while the row's is not.
 *
 * The SQL mirror is a real hazard and worth stating precisely: the two must
 * agree **at the moment the backfill runs**, after which they are free to
 * diverge harmlessly, because the `CASE` never runs again. `packages/db`'s
 * live-Postgres suite closes it by running 0010's rule against rows inserted
 * with the column unset and comparing the result to this function.
 *
 * **They already diverge in one place, on purpose.** `'typeface'` is an
 * identity role here and is absent from 0010's `CASE`, because 0010 runs before
 * 0011 adds the value — no row in the table can carry a role that does not yet
 * exist, so the branch is unreachable at backfill time and reachable forever
 * after. Adding it to the SQL would be dead code that reads as a rule.
 *
 * **The `role` branch must precede the `kind` branch.** The two orderings
 * differ only in that the wrong one files every brand mark as photography,
 * which is both the most visible row in the table and the one nobody would
 * think to check.
 */
export function defaultLibraryFor(a: { kind: AssetKind; role: AssetRole }): AssetLibrary {
  if (a.kind === 'color') return 'identity'
  if (a.role === 'logo' || a.role === 'mark' || a.role === 'typeface') return 'identity'
  return a.kind === 'image' ? 'photography' : 'collateral'
}

/**
 * Assets on one shelf, in `position` order, excluding soft-deleted rows.
 *
 * `assetsOfKind`'s sibling and deliberately its mirror: same filter on
 * `deletedAt`, same sort, and the same silence about `status` — a `proposed`
 * asset is still filed somewhere, and hiding it is `activeAssets`' job at the
 * read paths that want it hidden.
 */
export function assetsOfLibrary(
  assets: readonly BrandAsset[],
  library: AssetLibrary,
): BrandAsset[] {
  return assets.filter((a) => a.library === library && a.deletedAt === null).sort(byPosition)
}
