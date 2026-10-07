import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/** One key per purpose, so a sealed state can never be read as a token and the reverse. */
export function deriveKey(masterKey: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), purpose, 32))
}

/** AES-256-GCM. `aad` binds the ciphertext to its context: it opens only with the same aad. */
export function seal(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad))
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.')
}

/** Throws on any change to the ciphertext, the tag, the iv or the aad. */
export function unseal(key: Buffer, sealed: string, aad: string): string {
  const [iv, tag, body] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'))
  if (!iv || !tag || !body || iv.length !== 12 || tag.length !== 16) {
    throw new Error('Malformed sealed value')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}

export class SealError extends Error {
  constructor(readonly reason: 'invalid' | 'expired') {
    super(reason === 'expired' ? 'The request expired. Start again.' : 'The request is not valid.')
  }
}

/** Encrypted and authenticated, so the payload (a PKCE verifier, Page tokens) stays secret. */
export function sealExpiring(key: Buffer, purpose: string, value: object, ttlMs: number): string {
  return seal(key, JSON.stringify({ value, expiresAt: Date.now() + ttlMs }), purpose)
}

export function openExpiring<T>(key: Buffer, purpose: string, sealed: string): T {
  let parsed: { value: T; expiresAt: number }
  try {
    parsed = JSON.parse(unseal(key, sealed, purpose)) as { value: T; expiresAt: number }
  } catch {
    throw new SealError('invalid')
  }
  if (Date.now() > parsed.expiresAt) throw new SealError('expired')
  return parsed.value
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

export const pkceChallenge = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url')

export function hmacSha256(secret: string, message: string): Buffer {
  return createHmac('sha256', secret).update(message).digest()
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}
