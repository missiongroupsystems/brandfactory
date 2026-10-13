import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

/**
 * Where uploaded files live. The browser writes and reads them directly by signed URL, so a file
 * never passes through the API. Trimmed from the archive's storage port.
 */
export interface BlobStore {
  signedWriteUrl(
    key: string,
    contentType: string,
  ): Promise<{ url: string; headers: Record<string, string> }>
  signedReadUrl(key: string, ttlSeconds: number): Promise<string>
}

export function sign(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function verify(secret: string, value: string, signature: string): boolean {
  const expected = Buffer.from(sign(secret, value))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/**
 * Supabase Storage, as the archive used it: a private bucket, a signed upload URL, and a signed
 * read URL that expires.
 */
export function supabaseStore(config: {
  url: string
  serviceKey: string
  bucket: string
}): BlobStore {
  const bucket = createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(config.bucket)
  return {
    async signedWriteUrl(key, contentType) {
      const { data, error } = await bucket.createSignedUploadUrl(key, { upsert: true })
      if (error || !data) throw new Error(`createSignedUploadUrl failed: ${error?.message}`)
      return { url: data.signedUrl, headers: { 'content-type': contentType } }
    },
    async signedReadUrl(key, ttlSeconds) {
      const { data, error } = await bucket.createSignedUrl(key, ttlSeconds)
      if (error || !data) throw new Error(`createSignedUrl failed: ${error?.message}`)
      return data.signedUrl
    },
  }
}

/**
 * Files on this machine, for development. The server signs its own URLs and serves them at
 * `/blobs/<key>` (see `app.ts`); the signature, with its expiry, is the capability.
 */
export function diskStore(config: { root: string; secret: string; baseUrl: string }) {
  const url = (key: string, verb: 'get' | 'put', ttlSeconds: number) => {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds
    const sig = sign(config.secret, `${verb}:${key}:${exp}`)
    return `${config.baseUrl}/blobs/${key}?exp=${exp}&sig=${sig}`
  }
  const file = (key: string) => {
    const full = path.resolve(config.root, key)
    if (!full.startsWith(path.resolve(config.root) + path.sep)) throw new Error('bad key')
    return full
  }
  const store: BlobStore = {
    async signedWriteUrl(key, contentType) {
      return { url: url(key, 'put', 15 * 60), headers: { 'content-type': contentType } }
    },
    async signedReadUrl(key, ttlSeconds) {
      return url(key, 'get', ttlSeconds)
    },
  }
  return {
    store,
    /** True when the request carries a live signature for this verb and key. */
    allowed(verb: 'get' | 'put', key: string, exp: string, sig: string) {
      return Number(exp) * 1000 > Date.now() && verify(config.secret, `${verb}:${key}:${exp}`, sig)
    },
    async write(key: string, bytes: Uint8Array) {
      await mkdir(path.dirname(file(key)), { recursive: true })
      await writeFile(file(key), bytes)
    },
    read: (key: string) => readFile(file(key)),
  }
}
