import { z } from 'zod'
import { AgentMessageSchema } from '../agent/events'
import { BrandWithSectionsSchema } from '../brand/brand'
import { CanvasBlockIdSchema } from '../ids'
import { ResearchSourceSchema } from '../research/job'
import { CanvasBlockSchema, CanvasSchema } from './canvas'
import { ProjectSchema } from './project'

export const ProjectDetailSchema = z.intersection(
  ProjectSchema,
  z.object({
    canvas: CanvasSchema,
    blocks: z.array(CanvasBlockSchema),
    shortlistBlockIds: z.array(CanvasBlockIdSchema),
    recentMessages: z.array(AgentMessageSchema),
    brand: BrandWithSectionsSchema,
    /**
     * Present only on a brand-context thread that a research run landed its
     * report in (3F): that run's citations, in the vendor's own `[n]` marker
     * order, so the chat can render the report's markers as linked chips.
     * Absent everywhere else — including threads whose run predates migration
     * 0007, where the job row no longer knows which thread is its report's.
     */
    researchSources: z.array(ResearchSourceSchema).optional(),
  }),
)

export type ProjectDetail = z.infer<typeof ProjectDetailSchema>
