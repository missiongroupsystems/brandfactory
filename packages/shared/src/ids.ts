import { z } from 'zod'

// Branded string id helper. The runtime value is a string; the compile-time
// type is nominal so a BrandId can't be passed where a ProjectId is expected.
// The `_name` argument exists to capture the literal type parameter at the
// call site — it is not used at runtime.
export function brandedId<TBrand extends string>(_name: TBrand) {
  return z.string().min(1).brand<TBrand>()
}

export const BrandIdSchema = brandedId('BrandId')
export type BrandId = z.infer<typeof BrandIdSchema>

export const WorkspaceIdSchema = brandedId('WorkspaceId')
export type WorkspaceId = z.infer<typeof WorkspaceIdSchema>

export const ProjectIdSchema = brandedId('ProjectId')
export type ProjectId = z.infer<typeof ProjectIdSchema>

export const CanvasIdSchema = brandedId('CanvasId')
export type CanvasId = z.infer<typeof CanvasIdSchema>

export const CanvasBlockIdSchema = brandedId('CanvasBlockId')
export type CanvasBlockId = z.infer<typeof CanvasBlockIdSchema>

export const SectionIdSchema = brandedId('SectionId')
export type SectionId = z.infer<typeof SectionIdSchema>

export const BrandAssetIdSchema = brandedId('BrandAssetId')
export type BrandAssetId = z.infer<typeof BrandAssetIdSchema>

export const ResearchJobIdSchema = brandedId('ResearchJobId')
export type ResearchJobId = z.infer<typeof ResearchJobIdSchema>

export const SocialPostIdSchema = brandedId('SocialPostId')
export type SocialPostId = z.infer<typeof SocialPostIdSchema>

export const OutletIdSchema = brandedId('OutletId')
export type OutletId = z.infer<typeof OutletIdSchema>

export const UserIdSchema = brandedId('UserId')
export type UserId = z.infer<typeof UserIdSchema>
