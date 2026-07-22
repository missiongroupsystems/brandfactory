import { z } from 'zod'

// Partial brand patch. At least one key must be present so a bare `{}` is
// rejected at the wire boundary rather than becoming a no-op write.
export const UpdateBrandInputSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: 'At least one of name or description is required',
  })

export type UpdateBrandInput = z.infer<typeof UpdateBrandInputSchema>
