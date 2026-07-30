import { Hono } from 'hono'
import type { AppEnv } from '../context'
import type { Env } from '../env'
import { UnauthorizedError } from '../errors'

export interface ResearchConfigDeps {
  env: Env
}

/**
 * Deployment research config — `GET /research`.
 *
 * Brand-scoped `GET /brands/:id/research` already returns `enabled`, but the
 * create dialog needs that answer **before a brand exists** (decision 1's
 * opt-in). One boolean, auth required, no brand access check: this is
 * environment configuration, not a brand fact.
 */
export function createResearchConfigRouter(deps: ResearchConfigDeps) {
  return new Hono<AppEnv>().get('/', async (c) => {
    const userId = c.var.userId
    if (!userId) throw new UnauthorizedError()
    return c.json({ enabled: deps.env.RESEARCH_PROVIDER !== 'none' })
  })
}
