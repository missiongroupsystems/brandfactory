import { z } from 'zod'
import { ProjectSchema } from './project'

// Project row plus workspace-home fields. `lastActivityAt` is the greatest of
// project.updatedAt, newest agent_messages.created_at, and newest
// canvas_events.created_at for the project's canvas (computed server-side).
// Intersection (not .extend) because ProjectSchema is a discriminated union —
// same pattern as ProjectDetailSchema.
export const ProjectSummarySchema = z.intersection(
  ProjectSchema,
  z.object({
    brandName: z.string(),
    lastActivityAt: z.iso.datetime(),
  }),
)

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>
