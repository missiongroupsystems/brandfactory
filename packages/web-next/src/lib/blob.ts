"use client";

import type { BlobReadUrlResponse, BlobUploadResponse } from "@brandfactory/shared";
import useSWR, { type SWRResponse } from "swr";

import { getFreshAuthToken } from "@/auth/session";

import { AppError, BF_API_BASE_URL, bf, callJson } from "./api/bf-client";

/**
 * The blob path — web-next's first. Three pieces: a signed URL to *read* a blob, a signed URL
 * to *write* one, and the download that hands the bytes to somebody. No UI lives here; this is
 * the seam Phase 2E's deck version history and Phase 3D's photography upload both call.
 *
 * Ported from `packages/web/src/api/queries/blobs.ts` (the signed-URL constraints) and
 * `packages/web/src/lib/download.ts` (the download rule) — **the constraints, not the code**.
 * This package's server-state layer is SWR, not react-query, and its transport is `bf`
 * (`hc<AppType>`) wherever a route lets it be, rather than a hand-rolled fetch wrapper for
 * every call.
 */

// The server signs both a read URL and a write URL for 300 seconds — see
// `packages/server/src/routes/blobs-auth.ts`'s two `ttlSeconds: 300` calls. A mounted `<img>`
// refreshes a minute early so it never holds a token that expires mid-request.
export const BLOB_READ_URL_TTL_MS = 5 * 60 * 1000;
export const BLOB_READ_URL_REFRESH_MS = 4 * 60 * 1000;

const blobReadUrlKey = (key: string) => ["blob-read-url", key] as const;

/**
 * Mint one signed read URL.
 *
 * **Raw `fetch`, not `bf`.** `GET /blob-urls/:key{.+}/read-url` captures a multi-segment key
 * (e.g. `uploads/2024/04/uuid-name.png`) with Hono's `{.+}` regex param — the key's own slashes
 * have to land in the URL path unescaped. `hc<AppType>` encodes every param value with
 * `encodeURIComponent` before substituting it, which turns each `/` into `%2F` and sends a
 * request the route's regex does not match. `uploadBlob` below has no path param in its mint
 * call and goes through `bf` — this is the one call in this file that cannot.
 *
 * The constraint is on the *request* URL only. `callJson` takes any `fetch` `Response`, not just
 * one `bf` produced, so the *response* still goes through the same parsing and error handling as
 * every other call in this app — including the 401→`logout()` it already does.
 */
async function fetchReadUrl(key: string): Promise<string> {
  const token = await getFreshAuthToken();
  const res = await fetch(`${BF_API_BASE_URL}/blob-urls/${key}/read-url`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return callJson<BlobReadUrlResponse>(res).then((body) => body.url);
}

/**
 * A signed read URL for one blob key, refreshed before it expires.
 *
 * `key` may be `null`/`undefined` for a reference that has not resolved yet — the query is then
 * skipped rather than fired with a bad argument, the same "skip, don't guess" rule every other
 * conditional SWR key in this app follows (see `AGENTS.md` on `useCursorPages`-style hooks).
 */
export function useSignedReadUrl(key: string | null | undefined): SWRResponse<string, AppError> {
  return useSWR(key ? blobReadUrlKey(key) : null, ([, k]) => fetchReadUrl(k), {
    refreshInterval: BLOB_READ_URL_REFRESH_MS,
  });
}

export interface UploadBlobArgs {
  file: File;
}

/**
 * Two-step upload: mint a signed write URL through `bf`, then `PUT` the bytes straight to
 * storage. The server never reads the file — it only vouches for where it may land, so the
 * multi-megabyte body never passes through this app's own transport. Returns the storage key a
 * caller writes onto its own record (a deck version, a photography upload).
 */
export async function uploadBlob({ file }: UploadBlobArgs): Promise<{ key: string }> {
  const { key, url, headers } = await callJson<BlobUploadResponse>(
    await bf["blob-urls"]["upload-url"].$post({
      json: {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      },
    }),
  );

  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      "content-type": file.type || "application/octet-stream",
      ...(headers ?? {}),
    },
    body: file,
  });
  if (!putRes.ok) {
    throw new AppError(
      `Storage upload failed (${putRes.status})`,
      "STORAGE_PUT_FAILED",
      putRes.status,
    );
  }

  return { key };
}

/**
 * Save one signed URL to the user's disk under a chosen name.
 *
 * Ported from `packages/web/src/lib/download.ts`'s `downloadUrl`, unchanged in behaviour.
 * **One definition of what is downloadable, two readers** is that file's rule for *its* two
 * readers (a row deciding whether to draw a control, and a page performing the download); the
 * rule this function keeps here is the sibling of it — one definition of *how a download
 * happens*, so that Phase 2E's deck history and Phase 3D's photography upload are two readers
 * of this single implementation rather than two competing ones that drift.
 *
 * **Not a bare `<a href download>`.** The `download` attribute is ignored on a cross-origin
 * URL, and a signed blob URL is cross-origin under every storage provider but `local-disk`.
 * Fetching the bytes first makes the object URL same-origin by construction, so the attribute
 * is honoured everywhere rather than opening a new tab in production only.
 *
 * **Throws on a failed fetch** rather than resolving quietly — the caller is downloading a
 * named file and has to be able to say which one did not arrive.
 */
export async function downloadBlobUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch that file (${response.status})`);
  }
  const objectUrl = URL.createObjectURL(await response.blob());

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoked one macrotask later, not in a `finally`. The click queues the save rather than
  // completing it, and Safari has historically read the object URL after the handler returns —
  // a synchronous revoke saves a zero-byte file there and works everywhere else.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
