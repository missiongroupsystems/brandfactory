import type { BrandAsset, SocialPost } from '@brandfactory/shared'
import { assetUrl } from './asset-url'

// ---------------------------------------------------------------------------
// download — handing bytes to the user, and knowing which bytes there are
// ---------------------------------------------------------------------------
//
// There is no platform integration and none is planned (proposal §7), so the
// product's whole job on the daily clock is a clean handoff: the copy on the
// clipboard, the image in the downloads folder, the post marked. This file is
// the second of those three.

/** One file a post can hand over: where it lives and what to call it. */
export interface PostDownload {
  url: string
  filename: string
}

/**
 * The files a post can actually hand over, in attachment order.
 *
 * **One definition of *what is downloadable*, two readers** — the row, which
 * decides whether to draw the control at all, and the page, which performs the
 * downloads. Two definitions would produce a button that fails on click, and
 * the failure would look like a broken download rather than a disagreement
 * about the list.
 *
 * **Blob-source assets only.** A `link` asset points at somebody else's host —
 * a Drive or Dropbox share — and fetching it from the browser is a CORS gamble
 * that fails on most of them. Worse, a share URL commonly serves an HTML viewer
 * page rather than image bytes, so the *successful* case saves a web page named
 * after a photograph. A link's honest affordance is the link, not a download
 * button, and offering one here would be a control that mostly does not work.
 *
 * An id whose asset is soft-deleted, or whose signed URL has not landed yet,
 * resolves to nothing and is skipped — `Thumbs`' rule, for the same reason: the
 * join row survives a delete, so restoring the asset restores the download.
 */
export function postDownloads(
  post: SocialPost,
  assets: readonly BrandAsset[],
  resolveBlob: (key: string) => string,
): PostDownload[] {
  const byId = new Map(assets.map((a) => [a.id, a]))
  const files: PostDownload[] = []
  for (const id of post.assetIds) {
    const asset = byId.get(id)
    if (!asset || asset.source !== 'blob') continue
    const url = assetUrl(asset, resolveBlob)
    if (!url) continue
    // The uploaded name first — it carries the extension, which is what makes
    // the saved file open in the right application. `label` is what a person
    // typed and may be "Primary" with no extension at all.
    files.push({ url, filename: asset.filename ?? asset.label })
  }
  return files
}

/**
 * Save one URL to the user's disk under a chosen name.
 *
 * **Not a bare `<a href download>`.** The `download` attribute is ignored on a
 * cross-origin URL — the browser navigates instead — and a signed blob URL is
 * cross-origin under every storage provider but `local-disk`. Written the naive
 * way this opens the image in a new tab in production and saves the file in
 * development, which is the worst possible split: the failure never appears
 * where anyone is looking for it. Fetching the bytes first makes the object URL
 * same-origin by construction, so the attribute is honoured everywhere.
 *
 * **Throws on a failed fetch** rather than resolving quietly. The caller is
 * downloading a named file and has to be able to say which one did not arrive.
 */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not fetch that file (${response.status})`)
  }
  const objectUrl = URL.createObjectURL(await response.blob())

  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Revoked one macrotask later, not in a `finally`. The click queues the save
  // rather than completing it, and Safari has historically read the object URL
  // after the handler returns — a synchronous revoke saves a zero-byte file
  // there and works everywhere else, which is exactly the kind of split the
  // fetch above exists to avoid. `deferUntilMenuClosed`'s mechanism, different
  // reason.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
