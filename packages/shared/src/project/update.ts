import { z } from 'zod'

// Rename-only for now. Description / kind changes are not on the product
// surface — freeform stays freeform; standardized templates are Phase 10+.
export const UpdateProjectInputSchema = z.object({
  name: z.string().min(1).max(120),
})

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>
