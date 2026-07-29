import { AssetLinkUrlSchema } from '@brandfactory/shared'

// ---------------------------------------------------------------------------
// Record-time validation for a linked image
// ---------------------------------------------------------------------------
//
// The 1.8.0 mockup shipped a `logo-link-dead` scenario and the screenshot
// settled a question nobody had asked: it is **pixel-identical to a brand with
// no logo**. The monogram fallback costs nothing, "and that is the problem" —
// the hub gives no signal at all that a recorded logo is broken.
//
// The resolution is *not* to make the hub complain. A rail that scolds you
// about a background fact is what 1.7.0 spent a pass removing, and a link can
// rot years after it was recorded, so the hub would be nagging about something
// the user did not just do. Instead:
//
//   the link is validated at **record time**, where the user is holding the URL
//   and can fix it — and the library keeps its `Did not render` caption for a
//   link that rots later.
//
// **This is not share-URL rewriting.** `docs/plans/brand-assets.md` lists that
// as a non-goal: turning a Drive link into `?raw=1`, or a Dropbox one into
// `dl=1`, is guessing at another product's URL scheme and it breaks silently
// when they change it. This tells the user what happened and stops.

/**
 * What a failed probe says. One string, because the *reason* it failed is not
 * knowable from the browser — an `<img>` `error` event carries no status, no
 * content type and no message, by cross-origin design. So the copy names the
 * cause that is overwhelmingly likely (a share link serving a viewer page) and
 * offers both ways out, rather than inventing a diagnosis.
 */
export const IMAGE_URL_REFUSAL =
  'That URL didn’t load as an image. Share links from Drive and Dropbox usually serve a viewer ' +
  'page — paste a direct image URL, or upload the file instead.'

export type ImageUrlProbeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'unreachable'; message: string }

/** What a bad *scheme* says, before the network is touched at all. */
export const IMAGE_URL_INVALID = 'Enter a full http:// or https:// image URL.'

export interface ProbeImageUrlOptions {
  /** Injected in tests. Defaults to the DOM `Image` constructor. */
  createImage?: () => HTMLImageElement
  /**
   * How long to wait before calling it unreachable.
   *
   * A timeout is required rather than defensive: a host that blackholes the
   * request fires neither `load` nor `error`, so without this the form's save
   * button stays disabled forever with no explanation — the failure mode that
   * looks like a broken app rather than a bad URL.
   */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 8000

/**
 * Does this URL load as an image in *this* browser, right now?
 *
 * Deliberately an `<img>` rather than a `fetch`: the question is exactly "will
 * the tag we are about to render succeed", and a `fetch` answers a different
 * one — it is subject to CORS, so a perfectly good hotlinked image on a host
 * without `Access-Control-Allow-Origin` would fail the check and be refused.
 * An `<img>` has no such restriction, which is the whole reason hotlinking
 * works.
 *
 * The scheme is checked first, with the **same schema the server enforces**, so
 * a `javascript:` URL is refused without ever being handed to the DOM.
 */
export function probeImageUrl(
  url: string,
  { createImage, timeoutMs = DEFAULT_TIMEOUT_MS }: ProbeImageUrlOptions = {},
): Promise<ImageUrlProbeResult> {
  if (!AssetLinkUrlSchema.safeParse(url).success) {
    return Promise.resolve({ ok: false, reason: 'invalid', message: IMAGE_URL_INVALID })
  }

  return new Promise((resolve) => {
    const img = createImage ? createImage() : new Image()
    let settled = false

    const finish = (result: ImageUrlProbeResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // Stop a slow response arriving after the verdict and re-entering here.
      img.onload = null
      img.onerror = null
      resolve(result)
    }

    const timer = setTimeout(
      () => finish({ ok: false, reason: 'unreachable', message: IMAGE_URL_REFUSAL }),
      timeoutMs,
    )

    img.onload = () => finish({ ok: true })
    img.onerror = () => finish({ ok: false, reason: 'unreachable', message: IMAGE_URL_REFUSAL })
    img.src = url
  })
}
