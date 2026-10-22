import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

// The sealing the brandbase code uses: `../crypto.ts` with an expiry read from the caller's clock.

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

/** Undefined when the value is changed, sealed for another purpose, or expired. */
export function openExpiring<T>(key: Buffer, purpose: string, sealed: string, now: number) {
  try {
    const parsed = JSON.parse(unseal(key, sealed, purpose)) as { value: T; expiresAt: number }
    return now > parsed.expiresAt ? undefined : parsed.value
  } catch {
    return undefined
  }
}

export function sealExpiring(key: Buffer, purpose: string, value: object, expiresAt: number) {
  return seal(key, JSON.stringify({ value, expiresAt }), purpose)
}
