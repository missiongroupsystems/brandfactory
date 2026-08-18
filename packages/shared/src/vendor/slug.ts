import { slugify, uniqueSlug } from '../slug'

/**
 * The vendor half of the slug rule — `slugify` with this aggregate's fallback
 * word. The rule itself is in `../slug.ts`, shared with outlets and influencers.
 *
 * The source is the **name**. There is no handle to prefer, unlike a creator: a
 * company's name is the only identifier a person has for it before the UEN is
 * looked up.
 */

/**
 * What a name with no usable characters at all becomes — a company written
 * entirely in Chinese, for instance, which survives `slugify` as nothing.
 *
 * The word is `vendor` rather than `agency` or `supplier`: the screen, the nav
 * item and the route all say vendor, and `/vendors/vendor-3` reads as a record
 * rather than as a category.
 */
export const VENDOR_SLUG_FALLBACK = 'vendor'

export function vendorSlug(name: string): string {
  return slugify(name, VENDOR_SLUG_FALLBACK)
}

/**
 * The first free vendor slug in a workspace: the base, then `-2`, `-3`, and so
 * on. `taken` is every vendor slug already in the workspace, which is what the
 * query layer reads out of `vendors_workspace_slug_key`.
 *
 * **This path is taken more often here than on any other aggregate**, because
 * `name` is deliberately not unique: `"Sunbeam Social"` and
 * `"Sunbeam Social Pte Ltd"` are two legitimate rows and the second one lands on
 * `sunbeam-social-pte-ltd`, while a genuine re-entry of one name lands on `-2`.
 */
export function uniqueVendorSlug(name: string, taken: Iterable<string>): string {
  return uniqueSlug(vendorSlug(name), taken)
}
