import { useQueries, useQuery } from '@tanstack/react-query'
import type { BlobReadUrlResponse, BlobUploadResponse } from '@brandfactory/shared'
import { AppError } from '@/api/client'
import { useAuthStore } from '@/auth/store'
import { getFreshAuthToken } from '@/auth/session'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string

// Server signs read URLs for 5 minutes; refresh slightly before to avoid the
// race where an `<img>` mounts with a token that expires mid-request.
const READ_URL_TTL_MS = 5 * 60 * 1000
const READ_URL_REFRESH_MS = 4 * 60 * 1000

export const blobKeys = {
  readUrl: (key: string) => ['blob-read-url', key] as const,
}

// Hono's typed client doesn't round-trip the `:key{.+}` multi-segment regex
// param cleanly (the key contains slashes that need to land in the URL path,
// not be percent-encoded into a single segment). Raw fetch is simpler and
// matches the pattern `useAgentChat` already uses for the streaming endpoint.
async function fetchReadUrl(key: string, signal?: AbortSignal): Promise<string> {
  // This one runs on a 4-minute `refetchInterval` for the life of any mounted
  // image, so it is the surface most likely to be the first call made with an
  // expired token.
  const token = await getFreshAuthToken()
  const res = await fetch(`${API_BASE}/blob-urls/${key}/read-url`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal,
  })
  if (!res.ok) {
    if (res.status === 401) useAuthStore.getState().logout()
    throw new AppError(`Failed to mint read URL (${res.status})`, 'READ_URL_FAILED', res.status)
  }
  const body = (await res.json()) as BlobReadUrlResponse
  return body.url
}

export function useSignedReadUrl(blobKey: string | null | undefined) {
  return useQuery({
    queryKey: blobKeys.readUrl(blobKey ?? ''),
    enabled: !!blobKey,
    staleTime: READ_URL_REFRESH_MS,
    gcTime: READ_URL_TTL_MS,
    refetchInterval: READ_URL_REFRESH_MS,
    queryFn: ({ signal }) => fetchReadUrl(blobKey as string, signal),
  })
}

/**
 * Signed read URLs for many keys at once, as a `key → url` map.
 *
 * The asset library renders a grid, and every blob in it needs its own signed
 * URL on its own 4-minute refresh — but a component cannot call
 * `useSignedReadUrl` in a loop. `useQueries` takes a dynamic array and is the
 * supported way to do exactly this, so each key keeps an independent query,
 * cache entry and re-sign timer, shared with any `useSignedReadUrl` elsewhere
 * on the page because the key is the same.
 *
 * **Returning a map rather than a list is what keeps `AssetLibraryView` pure.**
 * The route resolves and passes a plain `resolveBlob` function; the view never
 * learns that a URL expires. That is the same seam 1.8.0 drew so the demo could
 * feed the component fixtures, and it survives this pass unchanged.
 *
 * A key with no URL yet is simply absent from the map — the caller renders
 * whatever it renders for an unresolved asset, which is its own placeholder
 * rather than a broken image.
 */
export function useSignedReadUrls(keys: readonly string[]): Record<string, string> {
  const unique = [...new Set(keys)]
  return useQueries({
    queries: unique.map((key) => ({
      queryKey: blobKeys.readUrl(key),
      staleTime: READ_URL_REFRESH_MS,
      gcTime: READ_URL_TTL_MS,
      refetchInterval: READ_URL_REFRESH_MS,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchReadUrl(key, signal),
    })),
    combine: (results) => {
      const map: Record<string, string> = {}
      results.forEach((r, i) => {
        const key = unique[i]
        if (key !== undefined && typeof r.data === 'string') map[key] = r.data
      })
      return map
    },
  })
}

export interface UploadBlobArgs {
  file: File
}

// Two-step upload: mint a signed write URL, then PUT the bytes directly to
// storage. Returns the storage key the caller passes to the create-block
// mutation. Errors from either step throw `AppError` so callers can toast.
export async function uploadBlob({ file }: UploadBlobArgs): Promise<{ key: string }> {
  const token = await getFreshAuthToken()
  const mintRes = await fetch(`${API_BASE}/blob-urls/upload-url`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    }),
  })
  if (!mintRes.ok) {
    if (mintRes.status === 401) useAuthStore.getState().logout()
    let message = `Upload failed (${mintRes.status})`
    let code = 'UPLOAD_FAILED'
    try {
      const body = (await mintRes.json()) as { code?: string; message?: string }
      if (body.message) message = body.message
      if (body.code) code = body.code
    } catch {
      // non-JSON body — defaults are fine
    }
    throw new AppError(message, code, mintRes.status)
  }
  const { key, url, headers } = (await mintRes.json()) as BlobUploadResponse

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      ...(headers ?? {}),
    },
    body: file,
  })
  if (!putRes.ok) {
    throw new AppError(
      `Storage upload failed (${putRes.status})`,
      'STORAGE_PUT_FAILED',
      putRes.status,
    )
  }

  return { key }
}
