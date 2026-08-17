import { z } from 'zod'
import { BrandIdSchema, WorkspaceIdSchema } from '../ids'
import { BrandGuidelineSectionSchema } from './guideline-section'

/**
 * A brand's home on the web.
 *
 * The protocol filter is the entire point of this schema, not decoration. This
 * value is rendered into an `href` (see `BrandIdentity`) and — from Stage 3 — is
 * the seed a research pass runs against, so a bare `z.url()` here would be a
 * stored XSS with a nice UI around it: zod accepts `javascript:alert(1)` as a
 * valid URL (measured against zod 4.3.6, not assumed — `new URL()` parses it
 * happily). `http`/`https` only, and the check lives here so that every schema
 * that carries a website — create, update, the row itself — is restricted by
 * construction rather than by each remembering to be.
 *
 * The 2048 cap is the conventional practical URL ceiling; the column is `text`
 * and would otherwise take an unbounded string.
 */
export const BrandWebsiteUrlSchema = z.url({ protocol: /^https?$/ }).max(2048)

export const BrandSchema = z.object({
  id: BrandIdSchema,
  workspaceId: WorkspaceIdSchema,
  /**
   * The **display label**, not the legal name.
   *
   * `passport.unit.name` holds the legal name (`Casa Vostra Pte. Ltd.`); this is what staff
   * read (`Casa Vostra`). The two may differ permanently — see the column's own note in
   * `packages/db/src/schema/brands.ts` and proposal §5 point 1.
   */
  name: z.string().min(1).max(120),
  description: z.string().nullable(),
  websiteUrl: BrandWebsiteUrlSchema.nullable(),
  /**
   * Does Mission Passport know about this brand?
   *
   * Decision: proposal §8 `D1-b`. Plan: phase 8b.
   *
   * `false` means the brand was created here and has not reached Passport yet — because
   * Passport was unreachable, or because the queued create has not been promoted by an
   * Admin. It is a **usable** state, not an error, and the UI labels it as a state rather
   * than a failure (phase 8f).
   *
   * **A boolean rather than the unit's UUID, deliberately.** The browser has no use for a
   * Passport identifier, and publishing one invites a client to key on it — at which point
   * a client holds a Passport id that only the server should resolve. Everything the UI
   * needs to decide is "does Passport know this or not".
   */
  linkedToPassport: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Brand = z.infer<typeof BrandSchema>

// Composed view returned by endpoints that hydrate sections alongside the
// brand row. Sections are stored in their own table (see Phase 2); this is
// the API-level join, not a storage shape.
//
// Brand list/grid projection with section + project counts lives in
// `./summary` (`BrandSummarySchema`) — the former `pick`-only summary was
// unused and is replaced by that shape for the workspace-home surface.
export const BrandWithSectionsSchema = BrandSchema.extend({
  sections: z.array(BrandGuidelineSectionSchema),
})

export type BrandWithSections = z.infer<typeof BrandWithSectionsSchema>
