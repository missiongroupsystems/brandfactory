import { type MakeApp } from './make'
import { pinterestApp } from './pinterest'
import { tiktokApp } from './tiktok'
import { type Platforms } from './routes'

/** Each platform's variables: all of them or none, with the key that seals the tokens. */
const GROUPS = {
  Pinterest: ['PINTEREST_APP_ID', 'PINTEREST_APP_SECRET', 'PINTEREST_REDIRECT_URL'],
  TikTok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URL'],
} as const

/**
 * The platform apps the environment sets up, checked once at startup: a platform with only some
 * of its variables, or without a 32-byte `TOKEN_ENCRYPTION_KEY`, stops the server and names them.
 */
export function platformsFromEnv(env: NodeJS.ProcessEnv = process.env): Platforms {
  const problems: string[] = []
  // Make holds the Meta tokens: its two settings, both or none, and no key of ours.
  const makeKeys = ['MAKE_WEBHOOK_URL', 'MAKE_WEBHOOK_SECRET'] as const
  if (makeKeys.some((k) => env[k])) {
    for (const k of makeKeys.filter((k) => !env[k])) problems.push(`${k}: Make needs both`)
    if (env.MAKE_WEBHOOK_URL && !/^https:\/\//.test(env.MAKE_WEBHOOK_URL)) {
      problems.push('MAKE_WEBHOOK_URL: an https address')
    }
  }
  for (const [name, keys] of Object.entries(GROUPS)) {
    if (!keys.some((k) => env[k])) continue
    for (const k of [...keys, 'TOKEN_ENCRYPTION_KEY'].filter((k) => !env[k])) {
      problems.push(`${k}: ${name} needs all its variables`)
    }
  }
  const key = env.TOKEN_ENCRYPTION_KEY
  const masterKey = key ? Buffer.from(key, 'base64') : undefined
  if (masterKey && masterKey.length !== 32) problems.push('TOKEN_ENCRYPTION_KEY: 32 bytes, base64')
  if (problems.length > 0) {
    throw new Error(`invalid environment:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  }
  return {
    pinterest: env.PINTEREST_APP_ID
      ? pinterestApp({
          appId: env.PINTEREST_APP_ID,
          appSecret: env.PINTEREST_APP_SECRET!,
          redirectUrl: env.PINTEREST_REDIRECT_URL!,
          masterKey: masterKey!,
        })
      : undefined,
    make:
      env.MAKE_WEBHOOK_URL && env.MAKE_WEBHOOK_SECRET
        ? ({ url: env.MAKE_WEBHOOK_URL, secret: env.MAKE_WEBHOOK_SECRET } satisfies MakeApp)
        : undefined,
    tiktok: env.TIKTOK_CLIENT_KEY
      ? tiktokApp({
          clientKey: env.TIKTOK_CLIENT_KEY,
          clientSecret: env.TIKTOK_CLIENT_SECRET!,
          redirectUrl: env.TIKTOK_REDIRECT_URL!,
          masterKey: masterKey!,
        })
      : undefined,
  }
}
