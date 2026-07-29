import { z } from 'zod'
import { BrandIdSchema, WorkspaceIdSchema } from '../ids'
import { BrandGuidelineSectionSchema } from './guideline-section'

/**
 * A brand's home on the web.
 *
 * The protocol filter is the entire point of this schema, not decoration. This
 * value is rendered into an `href` (see `BrandIdentity`) and — from Stage 3 — is
 * the seed a research pass runs against, so a bare `z.url()` here would be a
 * stored XSS with a nice UI around it: zod accepts `javascript:alert(1)` as a
 * valid URL (measured against zod 4.3.6, not assumed — `new URL()` parses it
 * happily). `http`/`https` only, and the check lives here so that every schema
 * that carries a website — create, update, the row itself — is restricted by
 * construction rather than by each remembering to be.
 *
 * The 2048 cap is the conventional practical URL ceiling; the column is `text`
 * and would otherwise take an unbounded string.
 */
export const BrandWebsiteUrlSchema = z.url({ protocol: /^https?$/ }).max(2048)

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
