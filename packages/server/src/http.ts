import { type Context } from 'hono'
import { z } from 'zod'
import { invalid } from './errors'

/** A client-made id (decision 1): the client sends UUIDs; the seed keeps the demo's ids. */
export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, 'an id is 1-80 letters, digits, - or _')

/** Reads and checks a JSON body; a bad body is a 400 naming each field. */
export async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw invalid('the body is not JSON')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw invalid('validation failed', 'VALIDATION', parsed.error.issues)
  return parsed.data
}
