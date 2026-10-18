import { devAuth, supabaseAuth, type AuthProvider } from './auth'
import { diskFiles, type DiskFiles, type Files, supabaseFiles } from './files'

/** The settings the server and the command line read, checked once. */
export interface CoreEnv {
  port: number
  host: string
  /** A Postgres server; without it the core runs on PGlite in `pgliteDir`. */
  databaseUrl?: string
  pgliteDir: string
  /** Which live pointer this core reads. */
  environment: string
  auth: AuthProvider
  /** A pinned clock, for the demo only. */
  now: () => Date
  corsOrigins: string[]
  /** Where uploaded files live, and, for files on this machine, the store the core serves. */
  files: Files
  disk?: DiskFiles
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * True only for a database on this machine. A host or address given in the query string is
 * where pg really connects, so any such parameter counts as remote.
 */
function isLocal(url: string): boolean {
  const u = new URL(url)
  if (u.searchParams.has('host') || u.searchParams.has('hostaddr')) return false
  return LOCAL_HOSTS.has(u.hostname.toLowerCase())
}

/**
 * Reads the environment. Production is `NODE_ENV=production` or a database that is not on this
 * machine: there the dev sign-in (the token is the user id) and a pinned clock are refused, so a
 * missing variable cannot open a deployment.
 */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): CoreEnv {
  const databaseUrl = env.DATABASE_URL || undefined
  const remote = databaseUrl ? !isLocal(databaseUrl) : false
  const production = env.NODE_ENV === 'production' || remote
  const provider = env.AUTH_PROVIDER ?? 'dev'
  if (provider !== 'dev' && provider !== 'supabase') {
    throw new Error(`AUTH_PROVIDER is dev or supabase, not ${provider}`)
  }
  if (production && provider === 'dev') throw new Error('the dev sign-in is refused in production')
  if (production && env.PIN_NOW) throw new Error('a pinned clock is refused in production')
  if (provider === 'supabase' && !env.SUPABASE_JWKS_URL) {
    throw new Error('AUTH_PROVIDER=supabase needs SUPABASE_JWKS_URL')
  }
  const port = Number(env.PORT ?? 3003)
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, '')
  // With the dev sign-in on this machine, a fixed secret, so addresses survive a restart. Anything
  // else sets its own: the fixed one is in this file for anyone to read.
  const local = !production && provider === 'dev'
  const secret = env.FILES_SECRET ?? (local ? 'dev-files-secret-only-on-this-machine' : '')
  if (secret.length < 32) throw new Error('FILES_SECRET is at least 32 characters')
  const filesProvider = env.FILES_PROVIDER ?? 'disk'
  if (filesProvider !== 'disk' && filesProvider !== 'supabase') {
    throw new Error(`FILES_PROVIDER is disk or supabase, not ${filesProvider}`)
  }
  if (production && filesProvider === 'disk') {
    throw new Error('files on disk are refused in production')
  }
  if (
    filesProvider === 'supabase' &&
    (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.FILES_BUCKET)
  ) {
    throw new Error(
      'FILES_PROVIDER=supabase needs SUPABASE_URL, SUPABASE_SERVICE_KEY, FILES_BUCKET',
    )
  }
  const disk =
    filesProvider === 'disk'
      ? diskFiles({ root: env.FILES_DIR ?? '.data/files', secret, baseUrl: publicUrl })
      : undefined
  const pinned = env.PIN_NOW ? new Date(env.PIN_NOW) : null
  if (pinned && Number.isNaN(pinned.getTime())) throw new Error('PIN_NOW is not a date')
  return {
    port,
    // With the dev sign-in a token is a user id, so the server listens on this machine only.
    host: env.HOST ?? (provider === 'dev' ? '127.0.0.1' : '0.0.0.0'),
    databaseUrl,
    pgliteDir: env.PGLITE_DIR ?? '.data/core',
    environment: env.CORE_ENVIRONMENT ?? 'local',
    auth:
      provider === 'supabase'
        ? supabaseAuth({
            jwksUrl: env.SUPABASE_JWKS_URL!,
            issuer: env.SUPABASE_JWT_ISSUER,
            audience: env.SUPABASE_JWT_AUDIENCE ?? 'authenticated',
          })
        : devAuth(),
    now: () => pinned ?? new Date(),
    corsOrigins: (env.CORS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    files: {
      store:
        disk?.store ??
        supabaseFiles({
          url: env.SUPABASE_URL!,
          serviceKey: env.SUPABASE_SERVICE_KEY!,
          bucket: env.FILES_BUCKET!,
        }),
      secret,
      publicUrl,
    },
    disk,
  }
}
