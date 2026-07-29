import { BrandWebsiteUrlSchema } from '@brandfactory/shared'

/**
 * What the two brand forms do with the `Website` field before it goes on the
 * wire.
 *
 * **The server is still the authority.** `BrandWebsiteUrlSchema` rejects
 * anything that is not `http`/`https` at the route boundary, and that check is
 * what stops `javascript:alert(1)` reaching an `href`. This function exists so
 * the user finds out *in the form* rather than through a red toast carrying a
 * zod message — so it validates with **the same schema**, not a second
 * hand-rolled rule that could drift away from it.
 *
 * It normalises exactly one thing: a value with no scheme gets `https://`.
 * `casavostra.com` is what people type and rejecting it would be pedantry. A
 * value that *has* a scheme is never rewritten — `javascript:alert(1)` stays
 * itself and is reported as an error, which is the point. That is also the line
 * the assets proposal draws for link rewriting (`?raw=1` share-URL guesswork is
 * a stated non-goal): add what is missing, never reinterpret what is there.
 */
export type WebsiteUrlResult = { ok: true; value: string | null } | { ok: false; error: string }

const WEBSITE_URL_ERROR = 'Enter a web address starting with http:// or https://'

// Any `scheme:` prefix at all, per RFC 3986. Deliberately broader than
// http/https: the job here is "did the user supply a scheme", and if they
// supplied a bad one it must survive to be rejected rather than be prefixed
// into `https://javascript:alert(1)`.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function normalizeWebsiteUrl(input: string): WebsiteUrlResult {
  const trimmed = input.trim()
  // An empty field is not an error — it is how you clear a website, and how
  // every brand that does not have one submits.
  if (!trimmed) return { ok: true, value: null }

  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`
  const parsed = BrandWebsiteUrlSchema.safeParse(candidate)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: WEBSITE_URL_ERROR }
}

/**
 * `https://www.casavostra.com/menu` → `casavostra.com/menu`. Falls back to the
 * raw string when the URL does not parse — a link the user typed by hand is
 * still worth rendering, and swallowing it would be a worse failure than an
 * ugly one.
 *
 * Lives here rather than in `BrandIdentity` (its home until Stage 1A) because
 * `BrandCard` renders the same host, and a card importing from the hub's
 * identity band to borrow a string helper is the wrong direction of dependency.
 */
export function displayHost(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.host.replace(/^www\./, '')
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')
    return `${host}${path}`
  } catch {
    return url
  }
}
