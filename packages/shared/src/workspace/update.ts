import { z } from 'zod'

export const UpdateWorkspaceInputSchema = z.object({
  name: z.string().min(1).max(120),
})

export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceInputSchema>
