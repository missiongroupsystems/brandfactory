// ---------------------------------------------------------------------------
// One answer to "what type is this blob", for both storage providers
// ---------------------------------------------------------------------------
//
// Stage 2D found that `local-disk` served every blob as
// `application/octet-stream`, that browsers sniff past that for PNG and JPEG
// and **never** for SVG, and so that an uploaded SVG logo fell back to the
// monogram — the failure that looks exactly like success. The fix derived the
// type from the key's extension, because the key is server-minted and the
// declared type was never persisted.
//
// The Stage 1–2 review found the other half of the same problem: **the two
// storage providers answer this question from different inputs.**
//
//   local-disk   `routes/blobs.ts` serves it, from the key's extension
//   supabase     Supabase serves it, from the `content-type` header the client
//                PUT with — a header this server hands the client at mint time
//
// `fly.toml` sets `STORAGE_PROVIDER = "supabase"`, and every Stage 2 live pass
// ran on `local-disk`. So the provider production actually uses is the one 2D's
// fix does not cover, and nothing had checked that the two agree.
//
// They can disagree, because the two inputs come from different fields of the
// same request: `POST /blob-urls/upload-url` takes `filename` *and*
// `contentType` and does not compare them. `{ filename: 'logo.svg',
// contentType: 'image/png' }` mints a key ending `.svg`, so local-disk serves
// `image/svg+xml` and Supabase serves `image/png` — for the same bytes.
//
// The resolution is to remove the disagreement at the source rather than to
// patch either reader: **the server mints the key, so it can guarantee the
// key's extension matches the type it is about to authorise.** See
// `keyWithCanonicalExtension`.
//
// What this still does not do — and cannot, from here — is give the Supabase
// path the `content-security-policy: default-src 'none'; sandbox` and `nosniff`
// headers that `routes/blobs.ts` sets. Those are a property of the server that
// serves the bytes, and on the Supabase path that server is Supabase. The
// exposure is narrower than it would be same-origin (a script inside an SVG
// would run on the storage origin, not the app's), but it is a real difference
// between the two deployments and it belongs in the bucket's own configuration,
// not in this file.

/**
 * Extension → content type, for the types a browser may render **inline** from
 * user-supplied bytes.
 *
 * An allowlist, not a lookup table: anything unrecognised stays
 * `application/octet-stream`, a default that cannot become a vector. It is
 * deliberately a subset of `ALLOWED_UPLOAD_MIMES` — `text/plain` and the Word
 * types are downloads, not things to render inline.
 */
export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

/** The extension this server appends for a given type. First match wins. */
const CANONICAL_EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
}

export function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPE_BY_EXTENSION[ext] ?? 'application/octet-stream'
}

/**
 * A key whose extension agrees with `contentType`, so that a provider reading
 * the extension and a provider reading the declared header reach the same
 * answer.
 *
 * Three cases, and the third is the one that matters:
 *
 *   the type is not inline-renderable   → key unchanged. Both providers are
 *                                         already consistent enough: local-disk
 *                                         says octet-stream, Supabase says the
 *                                         declared type, and neither renders.
 *   the extension already maps to it    → key unchanged. `logo.png` + image/png
 *   anything else                       → append the canonical extension.
 *                                         `logo.svg` + image/png → `logo.svg.png`
 *
 * **Appending rather than rejecting** is deliberate. A file simply named `logo`
 * with a correct `image/png` is the ordinary case, not an attack, and refusing
 * it would be a UX regression in service of a rule the user cannot see. The
 * mismatched case is not refused either — it is *disarmed*, because the bytes
 * are served as the type the uploader asked this server to authorise, which is
 * the one `ALLOWED_UPLOAD_MIMES` actually checked.
 */
export function keyWithCanonicalExtension(key: string, contentType: string): string {
  const canonical = CANONICAL_EXTENSION_BY_TYPE[contentType.toLowerCase()]
  if (!canonical) return key
  if (contentTypeForKey(key) === contentType.toLowerCase()) return key
  return `${key}.${canonical}`
}
