import { z } from 'zod'
import { BrandIdSchema, OutletIdSchema, WorkspaceIdSchema } from '../ids'
import { SlugSchema } from '../slug'

// ---------------------------------------------------------------------------
// Outlet — a place the business trades from
// ---------------------------------------------------------------------------
//
// The record arrived with the Operations Hub shell and is BrandFactory's now.
// It is deliberately **workspace-scoped with an optional brand**, not
// brand-scoped: the outlets screen groups by brand and filters by brand, and
// neither is a question you can ask a list that already holds one brand only.
// A site with no brand yet is a first-class state, not a gap.
//
// **A pipeline outlet is the same record type as an open one.** A site that has
// not opened still has an address, a target date and a brand it will trade
// under, and splitting it into a second table would mean migrating a row on the
// day it opens — which is the day nobody wants to be moving data.
//
// There is no `entity` / holding-company dimension here, and its absence is a
// decision rather than an omission. The Operations Hub carried one; this product
// has no entities table, no entities screen and no marketing reading of a
// registered company, so an `entity_id` would be a foreign key pointing at
// nothing.

/**
 * What the site is. Same five members the Operations Hub used, kept word for
 * word so `OUTLET_TYPE_LABELS` in `packages/web-next` stays one list rather
 * than two that drift.
 */
export const OutletTypeSchema = z.enum(['restaurant', 'bar', 'cafe', 'central_kitchen', 'office'])
export type OutletType = z.infer<typeof OutletTypeSchema>

/**
 * Where the site is in its life. `pipeline` and `fitting_out` are both *before*
 * trading — the split matters because one is a plan and the other is a project
 * with a handover date.
 *
 * Nothing advances this automatically. A `pipeline` outlet whose target date has
 * passed is a plan that slipped, which is information rather than an error — the
 * same call `SocialPostStatusSchema` makes for a `ready` post whose slot is gone.
 */
export const OutletStatusSchema = z.enum([
  'pipeline',
  'fitting_out',
  'open',
  'temporarily_closed',
  'closed',
])
export type OutletStatus = z.infer<typeof OutletStatusSchema>

/**
 * The URL segment. Generated from the name **at create and frozen after**, so a
 * link written today survives a rename — which is the only reason to carry a
 * slug at all rather than routing on the id.
 *
 * Unique per workspace, enforced by an index; see `outletSlug` for how the
 * suffix is chosen.
 *
 * The shape is `SlugSchema`, shared with every other aggregate that carries a
 * slug, because one generator writes them all — two regexes would be two chances
 * for a schema to reject what `slugify` emits. The name stays so that a reader of
 * `OutletSchema` still finds the word `Outlet` on every field.
 */
export const OutletSlugSchema = SlugSchema

/**
 * What the site does — `serves_alcohol`, `outdoor_seating`, and so on.
 *
 * **A free list of keys, not an enum, and that is the point.** The catalogue in
 * `attributes.ts` is what the picker offers and what a label is read from, but
 * the wire accepts anything: outlets arrive here by import, and rejecting a whole
 * batch because a source system spells one tag differently would be a sync that
 * fails on the data it exists to carry. An unknown key renders as itself
 * (`outletAttributeLabel`) rather than disappearing.
 *
 * Duplicates are rejected because the set is a set — two `serves_alcohol` entries
 * are not a stronger statement, and letting them through would make the picker's
 * checkbox state disagree with the stored array.
 */
export const OutletAttributesSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(30)
  .refine((keys) => new Set(keys).size === keys.length, {
    message: 'attributes must not contain duplicates',
  })

export const OutletNameSchema = z.string().trim().min(1).max(200)
export const OutletNotesSchema = z.string().max(5000)

/**
 * A business date, not an instant. An outlet opens on 2 November 2026 where it
 * stands; it does not open at a moment different readers see as different days.
 * `z.iso.date()` rather than `z.iso.datetime()` for that reason, and the column
 * behind it is a `date` — `packages/web-next`'s `formatDate` never constructs a
 * `Date` from one, for the same reason.
 */
export const OutletDateSchema = z.iso.date()

export const OutletSchema = z.object({
  id: OutletIdSchema,
  workspaceId: WorkspaceIdSchema,
  /** `null` = not yet assigned to a brand. A real state, not a missing value. */
  brandId: BrandIdSchema.nullable(),
  slug: OutletSlugSchema,
  name: OutletNameSchema,
  outletType: OutletTypeSchema,
  status: OutletStatusSchema,
  address: z.string().max(300).nullable(),
  unit: z.string().max(50).nullable(),
  postalCode: z.string().max(20).nullable(),
  attributes: OutletAttributesSchema,
  /** The plan. Set while the site is `pipeline` or `fitting_out`. */
  targetOpeningDate: OutletDateSchema.nullable(),
  /** What happened. Set once it traded. */
  openingDate: OutletDateSchema.nullable(),
  closingDate: OutletDateSchema.nullable(),
  notes: OutletNotesSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Outlet = z.infer<typeof OutletSchema>

/**
 * The canonical ordering, mirroring `listOutletsByWorkspace`'s SQL
 * (`name asc, id asc`). Alphabetical because the list is exhaustive and read as
 * a directory — there is no "most recent outlet" a reader is looking for.
 *
 * `localeCompare` here and `order by name` in Postgres are not the same collation
 * and will disagree on accented names. The client does not re-sort what the
 * server sends, so this is for lists the client builds itself; it exists so that
 * a second sort is not hand-written per screen.
 */
export function byOutletName(a: Outlet, b: Outlet): number {
  const byName = a.name.localeCompare(b.name)
  return byName !== 0 ? byName : a.id.localeCompare(b.id)
}

/**
 * The date the list and the detail page show, and what it means.
 *
 * A site that has not opened shows its **target** date; anything else shows when
 * it opened. They are different columns and different kinds of fact — a target is
 * a plan and can move, an opening date is history — so every surface that renders
 * one has to say which it is showing. Returning the label with the value is what
 * stops a screen from quietly merging them under one heading.
 */
export function outletDateOnShow(
  outlet: Pick<Outlet, 'status' | 'openingDate' | 'targetOpeningDate'>,
): { date: string | null; label: 'Target' | 'Opened' } {
  const planning = outlet.status === 'pipeline' || outlet.status === 'fitting_out'
  return planning
    ? { date: outlet.targetOpeningDate, label: 'Target' }
    : { date: outlet.openingDate, label: 'Opened' }
}
