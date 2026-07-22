import { z } from 'zod'
import { BrandIdSchema, WorkspaceIdSchema } from '../ids'
import { BrandGuidelineSectionSchema } from './guideline-section'

export const BrandSchema = z.object({
  id: BrandIdSchema,
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1).max(120),
  description: z.string().nullable(),
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
