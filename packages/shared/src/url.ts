import { z } from 'zod'

/**
 * The http/https URL rule, in one place because two writers would drift.
 *
 * It arrived as `BrandWebsiteUrlSchema` in `brand/brand.ts` and moved here the
 * day a second aggregate needed it. **Nothing about the rule changed in the
 * move** — `BrandWebsiteUrlSchema` is now a re-export and accepts and rejects
 * exactly what it accepted and rejected before, which is what lets every brand
 * already in the table keep passing its own schema. `shared/src/slug.ts` is the
 * precedent for the extraction.
 *
 * The protocol filter is the entire point of this schema, not decoration. The
 * value is rendered into an `href`, so a bare `z.url()` here would be a stored
 * XSS with a nice UI around it: zod accepts `javascript:alert(1)` as a valid URL
 * (measured against zod 4.3.6, not assumed — `new URL()` parses it happily).
 * `http`/`https` only, and the check lives here so that every schema carrying a
 * website — create, update, the row itself, on any aggregate — is restricted by
 * construction rather than by each remembering to be.
 *
 * The 2048 cap is the conventional practical URL ceiling; the columns behind it
 * are `text` and would otherwise take an unbounded string.
 */
export const WebsiteUrlSchema = z.url({ protocol: /^https?$/ }).max(2048)
