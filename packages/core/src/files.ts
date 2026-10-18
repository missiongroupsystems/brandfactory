import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { Refused } from './errors'

/**
 * Files a person uploads. The browser writes and reads them straight from storage by signed URL,
 * so a file never passes through a move. The core makes every key (`<pack>/<uuid>.<ext>`), never
 * the client, and storage never overwrites a key: what was uploaded under a key stays.
 */
export interface FileStore {
  signedWriteUrl(
    key: string,
    type: string,
  ): Promise<{ url: string; headers: Record<string, string> }>
  signedReadUrl(key: string, ttlSeconds: number): Promise<string>
}

export interface Files {
  store: FileStore
  /** Signs the stable addresses; changing it breaks every address handed out. */
  secret: string
  /** The core's public address, for the stable addresses. */
  publicUrl: string
}

/** The most one upload may be: a 90-second video at a high bitrate fits. */
export const MAX_FILE_BYTES = 500 * 1024 * 1024

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
}

/** A key the core made: the pack, a random id, the extension of its type. */
const KEY = /^([a-z][a-z0-9_.]{0,99})\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/

/** A new key for a file of this type in this pack. */
export function newKey(pack: string, type: unknown): string {
  return `${pack}/${randomUUID()}.${EXT[String(type)] ?? 'bin'}`
}

/** The type a stored file is served as, from its key's extension. */
export function typeOfKey(key: string): string {
  const ext = key.split('.').pop() ?? ''
  const found = Object.entries(EXT).find(([, e]) => e === ext)
  // SVG can carry script; it is served as a download type, never as an image document.
  if (!found || found[0] === 'image/svg+xml') return 'application/octet-stream'
  return found[0]
}

export function sign(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function verify(secret: string, value: string, signature: string): boolean {
  const expected = Buffer.from(sign(secret, value))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** The stable address of a file: it survives a reload, and only the core can make one. */
export function fileSrc(files: Files, key: string): string {
  return `${files.publicUrl}/files/${sign(files.secret, `file:${key}`)}/${key}`
}

/**
 * An upload move's answer: its `upload: {key, type}` becomes a signed write URL, and `src` the
 * file's stable address. The key must be one the core made for this pack.
 */
export async function withUpload(files: Files | undefined, pack: string, result: unknown) {
  if (!files) throw new Refused(501, 'NO_FILES', 'this core keeps no files')
  const upload = (result as { upload?: { key?: unknown; type?: unknown } } | null)?.upload
  const key = typeof upload?.key === 'string' ? upload.key : ''
  if (KEY.exec(key)?.[1] !== pack || typeof upload?.type !== 'string') {
    throw new Error(`an upload move answered a key the core did not make: ${key.slice(0, 120)}`)
  }
  return {
    ...(result as object),
    upload: await files.store.signedWriteUrl(key, upload.type),
    src: fileSrc(files, key),
  }
}

/** The key a stable address names, or null when its signature is wrong. */
export function keyOfSrc(files: Files, signature: string, key: string): string | null {
  return KEY.test(key) && verify(files.secret, `file:${key}`, signature) ? key : null
}

/**
 * Supabase Storage, as the archive used it: a private bucket, a signed upload URL that does not
 * overwrite, and a signed read URL that expires.
 */
export function supabaseFiles(config: {
  url: string
  serviceKey: string
  bucket: string
}): FileStore {
  const bucket = createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(config.bucket)
  return {
    async signedWriteUrl(key, type) {
      const { data, error } = await bucket.createSignedUploadUrl(key, { upsert: false })
      if (error || !data) throw new Error(`createSignedUploadUrl failed: ${error?.message}`)
      return { url: data.signedUrl, headers: { 'content-type': type } }
    },
    async signedReadUrl(key, ttlSeconds) {
      const { data, error } = await bucket.createSignedUrl(key, ttlSeconds)
      if (error || !data) throw new Error(`createSignedUrl failed: ${error?.message}`)
      return data.signedUrl
    },
  }
}

/**
 * Files on this machine, for development. The core signs its own URLs and serves them at
 * `/blobs/<key>` (`app.ts`); the signature, with its expiry, is the right.
 */
export function diskFiles(config: { root: string; secret: string; baseUrl: string }) {
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
  const store: FileStore = {
    async signedWriteUrl(key, type) {
      return { url: url(key, 'put', 15 * 60), headers: { 'content-type': type } }
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
    /** Writes a new file; false when the key holds one already, which is never replaced. */
    async write(key: string, bytes: Uint8Array): Promise<boolean> {
      const full = file(key)
      await mkdir(path.dirname(full), { recursive: true })
      return writeFile(full, bytes, { flag: 'wx' }).then(
        () => true,
        (err: NodeJS.ErrnoException) => {
          if (err.code === 'EEXIST') return false
          throw err
        },
      )
    },
    read: (key: string) => readFile(file(key)),
  }
}

export type DiskFiles = ReturnType<typeof diskFiles>
