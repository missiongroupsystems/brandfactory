export interface Config {
  port: number
  publicBaseUrl: string
  databasePath: string
  encryptionKey: Buffer
  meta: { appId: string; appSecret: string; configId: string }
  pinterest: { appId: string; appSecret: string }
  tiktok: { clientKey: string; clientSecret: string }
}

const REQUIRED = [
  'PUBLIC_BASE_URL',
  'TOKEN_ENCRYPTION_KEY',
  'META_APP_ID',
  'META_APP_SECRET',
  'META_CONFIG_ID',
  'PINTEREST_APP_ID',
  'PINTEREST_APP_SECRET',
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
] as const

/** Fails at startup, naming every missing variable at once, rather than at the first connect. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const missing = REQUIRED.filter((name) => !env[name]?.trim())
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. See .env.example.`,
    )
  }
  const get = (name: (typeof REQUIRED)[number]) => (env[name] as string).trim()

  const encryptionKey = Buffer.from(get('TOKEN_ENCRYPTION_KEY'), 'base64')
  if (encryptionKey.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be 32 bytes in base64. Make one: openssl rand -base64 32',
    )
  }
  let base: URL
  try {
    base = new URL(get('PUBLIC_BASE_URL'))
  } catch {
    throw new Error('PUBLIC_BASE_URL must be an absolute URL, such as http://localhost:3010')
  }

  return {
    port: Number(env.PORT ?? 3010),
    publicBaseUrl: base.origin + base.pathname.replace(/\/$/, ''),
    databasePath: env.DATABASE_PATH?.trim() || '.data/connect',
    encryptionKey,
    meta: {
      appId: get('META_APP_ID'),
      appSecret: get('META_APP_SECRET'),
      configId: get('META_CONFIG_ID'),
    },
    pinterest: { appId: get('PINTEREST_APP_ID'), appSecret: get('PINTEREST_APP_SECRET') },
    tiktok: { clientKey: get('TIKTOK_CLIENT_KEY'), clientSecret: get('TIKTOK_CLIENT_SECRET') },
  }
}
