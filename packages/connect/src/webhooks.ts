import { hmacSha256, safeEqual } from './crypto'

/**
 * Meta's deauthorize and data-deletion callbacks POST `signed_request`:
 * base64url(HMAC-SHA256(payload, app secret)) + '.' + base64url(JSON payload).
 * Returns the app-scoped Facebook user id, or null when the signature does not hold.
 */
export function parseMetaSignedRequest(signedRequest: string, appSecret: string): string | null {
  const [signature, payload] = signedRequest.split('.')
  if (!signature || !payload) return null
  const expected = hmacSha256(appSecret, payload)
  if (!safeEqual(expected, Buffer.from(signature, 'base64url'))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      algorithm?: string
      user_id?: string
    }
    if (data.algorithm?.toUpperCase() !== 'HMAC-SHA256' || !data.user_id) return null
    return data.user_id
  } catch {
    return null
  }
}

const TIKTOK_TOLERANCE_MS = 5 * 60 * 1000

/**
 * TikTok sends `TikTok-Signature: t=<unix seconds>,s=<hex>`, where s is
 * HMAC-SHA256(client secret, `${t}.${raw body}`). An old timestamp is refused as a replay.
 */
export function verifyTikTokSignature(
  header: string | undefined,
  rawBody: string,
  clientSecret: string,
  now = Date.now(),
): boolean {
  if (!header) return false
  const parts = Object.fromEntries(header.split(',').map((part) => part.trim().split('=', 2)))
  const timestamp = Number(parts.t)
  if (!parts.s || !Number.isFinite(timestamp)) return false
  if (Math.abs(now - timestamp * 1000) > TIKTOK_TOLERANCE_MS) return false
  const expected = hmacSha256(clientSecret, `${parts.t}.${rawBody}`)
  return safeEqual(expected, Buffer.from(String(parts.s), 'hex'))
}
