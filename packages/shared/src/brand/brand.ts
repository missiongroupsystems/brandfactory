import { z } from 'zod'
import { BrandIdSchema, WorkspaceIdSchema } from '../ids'
import { WebsiteUrlSchema } from '../url'
import { BrandGuidelineSectionSchema } from './guideline-section'

/**
 * A brand's home on the web — `WebsiteUrlSchema` under this aggregate's name.
 *
 * The rule moved to `../url.ts` the day vendors needed the same one, and
 * **nothing about it changed in the move**: same protocol filter, same 2048 cap,
 * same acceptances and same refusals. This alias stays because every schema that
 * carries a brand's website already imports it, and because the name says which
 * field it belongs to at the call site.
 *
 * Read `../url.ts` for why the protocol filter is the entire point of it.
 */
export const BrandWebsiteUrlSchema = WebsiteUrlSchema

export const BrandSchema = z.object({
  id: BrandIdSchema,
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1).max(120),
  description: z.string().nullable(),
  websiteUrl: BrandWebsiteUrlSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Brand = z.infer<typeof BrandSchema>

// Composed view returned by endpoints that hydrate sections alongside the
// brand row. Sections are stored in their own table (see Phase 2); this is
// the API-level join, not a storage shape.
//
// Brand list/grid projection with section + project counts lives in
// `./summary` (`BrandSummarySchema`) — the former `pick`-only summary was
// unused and is replaced by that shape for the workspace-home surface.
export const BrandWithSectionsSchema = BrandSchema.extend({
  sections: z.array(BrandGuidelineSectionSchema),
})

export type BrandWithSections = z.infer<typeof BrandWithSectionsSchema>
