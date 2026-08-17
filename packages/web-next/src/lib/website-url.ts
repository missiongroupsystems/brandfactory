import { BrandWebsiteUrlSchema } from "@brandfactory/shared";

/**
 * What the brand form does with the `Website` field before it goes on the wire.
 *
 * Ported from `packages/web/src/lib/website-url.ts`.
 *
 * **The server is still the authority.** `BrandWebsiteUrlSchema` rejects anything that is not
 * `http`/`https` at the route boundary, and that check is what stops `javascript:alert(1)`
 * reaching an `href`. This function exists so the reader finds out *in the form* rather than
 * through a red toast carrying a zod message — so it validates with **the same schema**, not a
 * second hand-rolled rule that could drift away from it.
 *
 * It normalises exactly one thing: a value with no scheme gets `https://`. `casavostra.com` is
 * what people type and rejecting it would be pedantry. A value that *has* a scheme is never
 * rewritten — `javascript:alert(1)` stays itself and is reported as an error, which is the
 * point. Add what is missing; never reinterpret what is there.
 */
export type WebsiteUrlResult = { ok: true; value: string | null } | { ok: false; error: string };

const WEBSITE_URL_ERROR = "Enter a web address starting with http:// or https://";

// Any `scheme:` prefix at all, per RFC 3986. Deliberately broader than http/https: the job here
// is "did the user supply a scheme", and if they supplied a bad one it must survive to be
// rejected rather than be prefixed into `https://javascript:alert(1)`.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeWebsiteUrl(input: string): WebsiteUrlResult {
  const trimmed = input.trim();
  // An empty field is not an error — it is how a brand without a website submits.
  if (!trimmed) return { ok: true, value: null };

  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = BrandWebsiteUrlSchema.safeParse(candidate);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: WEBSITE_URL_ERROR };
}
