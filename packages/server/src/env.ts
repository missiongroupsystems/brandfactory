import { z } from 'zod'

const Env = z
  .object({
    NODE_ENV: z.string().default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().default('0.0.0.0'),
    /** The deployed database. Without it the server runs on PGlite in `PGLITE_DIR`. */
    DATABASE_URL: z.string().min(1).optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(5),
    PGLITE_DIR: z.string().default('.data/pglite'),
    /** `dev`: the bearer token is the user id. Refused in production. */
    AUTH_PROVIDER: z.enum(['dev', 'supabase']).default('dev'),
    SUPABASE_JWKS_URL: z.string().url().optional(),
    SUPABASE_JWT_ISSUER: z.string().optional(),
    SUPABASE_JWT_AUDIENCE: z.string().default('authenticated'),
    /** This API's public address, for the media links it hands out. */
    PUBLIC_URL: z.string().url().default('http://localhost:3001'),
    /** Signs media links. Changing it breaks every link handed out. */
    MEDIA_SIGNING_SECRET: z.string().min(16).default('development-only-secret'),
    /** `disk`: files under BLOB_DIR, served by this API. Refused in production. */
    STORAGE_PROVIDER: z.enum(['disk', 'supabase']).default('disk'),
    BLOB_DIR: z.string().default('.data/blobs'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_KEY: z.string().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().default('brandbase'),
    /** How often the job runner looks for posts that are due, in seconds. */
    JOB_INTERVAL_S: z.coerce.number().int().min(1).default(15),
    /** Comma-separated browser origins, such as the Vercel demo. */
    CORS_ALLOWED_ORIGINS: z.string().default(''),
    /**
     * Pins the clock to an instant, so a local run agrees with the demo's fixed month (its "today"
     * is Tue 6 Oct 2026). Refused in production.
     */
    PIN_NOW: z.string().datetime().optional(),
  })
  .superRefine((env, ctx) => {
    // A real database means a deployment, whatever NODE_ENV says.
    const production = env.NODE_ENV === 'production' || Boolean(env.DATABASE_URL)
    // Dev auth there would let any bearer token stand for any user.
    if (production && env.AUTH_PROVIDER === 'dev') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_PROVIDER'],
        message: 'dev auth runs only on the local PGlite database',
      })
    }
    if (production && env.PIN_NOW) {
      ctx.addIssue({ code: 'custom', path: ['PIN_NOW'], message: 'a pinned clock in production' })
    }
    if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'required in production' })
    }
    if (production && env.STORAGE_PROVIDER === 'disk') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_PROVIDER'],
        message: 'disk storage in production',
      })
    }
    if (production && env.MEDIA_SIGNING_SECRET === 'development-only-secret') {
      ctx.addIssue({
        code: 'custom',
        path: ['MEDIA_SIGNING_SECRET'],
        message: 'required in production',
      })
    }
    if (env.STORAGE_PROVIDER === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_SERVICE_KEY'],
        message: 'required for supabase storage',
      })
    }
    if (env.AUTH_PROVIDER === 'supabase' && !env.SUPABASE_JWKS_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_JWKS_URL'],
        message: 'required for supabase',
      })
    }
  })

export type Env = z.infer<typeof Env>

/** Reads the environment and stops at startup naming every bad variable. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    throw new Error(`invalid environment:\n${lines.join('\n')}`)
  }
  return parsed.data
}
