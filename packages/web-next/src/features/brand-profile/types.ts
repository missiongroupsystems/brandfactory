import type { SuggestedSectionKind } from "@brandfactory/shared";

/**
 * The Brand Profile's view model — what the page renders, not what the API returns.
 *
 * **Why a view model at all**, when `GET /brands/:id` already answers `BrandWithSections` and
 * this package can import that type from `@brandfactory/shared`: because a guideline section's
 * body is a **ProseMirror document**, and turning one into JSX is the integration work this pass
 * deliberately does not do (`docs/plans/brand-profiles.md` §6). Authoring fixtures as ProseMirror
 * would have been thirty lines of `{ type: "doc", content: [...] }` per section to render the same
 * three paragraphs.
 *
 * So the seam is drawn here instead. Everything below is *already flattened*: a body is a list of
 * blocks, a TL;DR is a string, a date is a business date. The mapper is `map.ts` and the walk that
 * learns ProseMirror is `blocks.ts`; the fixtures they replaced are deleted, and **no component
 * moved** when they landed.
 *
 * **The view model is the read side only.** `SectionEditorSheet` writes the *stored* document,
 * reached from the SWR cache rather than from a `ProfileBlock[]` — so the flattening below is
 * lossy without ever losing anything: a mark this page cannot render survives every save.
 *
 * The two rules the mapper honours, recorded here because they are invisible from the component
 * side:
 *
 * 1. A `list` block is a real list in the document — a bullet or ordered list — and each item is
 *    one line. It is *not* a paragraph that happens to start with a dash. `shared`'s
 *    `brandContentPillars()` already makes exactly this call for the planner, and the pillar band
 *    (§2.1 of the plan) depends on the same distinction.
 * 2. An **empty** section is a labelled row whose body says nothing, and it is a real and common
 *    state — the rail's suggestion chips create them on purpose. `blocks: []` is that state, and
 *    it is not the same as the section being absent.
 */

/** One block of a section's body. The flattened form of a ProseMirror node. */
export type ProfileBlock =
  | { kind: "paragraph"; text: string }
  /** A bullet or ordered list. One string per item, in document order. */
  | { kind: "list"; items: string[] };

export interface ProfileSection {
  /** The `guideline_sections` row id. Stable, and the fallback for an anchor (see `profile.ts`). */
  id: string;
  /** As the brand typed it. Free text — the taxonomy is a suggestion, never a constraint. */
  label: string;
  /**
   * Whether this section reads *across* the brand or describes one facet of it.
   *
   * Carried on the row rather than re-derived per component, but it is not a new fact: the mapper
   * fills it from `shared`'s `sectionKindForLabel()`, which resolves a typed label against
   * `SUGGESTED_SECTIONS` punctuation-tolerantly and falls back to `aspect` for anything a brand
   * invented.
   */
  kind: SuggestedSectionKind;
  /** The body. `[]` means the row exists and says nothing — see rule 2 above. */
  blocks: ProfileBlock[];
  /**
   * Who wrote it. Already on the real row (`guideline_sections.created_by`) and shown nowhere in
   * the product today; the profile renders it as a chip, because a marketer needs to know which
   * paragraphs a model drafted and nobody has approved.
   */
  createdBy: "user" | "agent";
  /**
   * A **business date** (`YYYY-MM-DD`), not an instant — so `lib/format.ts`'s `formatDate` applies
   * and no reader west of Greenwich sees yesterday. The mapper truncates the row's timestamp.
   */
  updatedAt: string;
}

/** One colour from the brand's identity library. `value` is whatever CSS accepts. */
export interface ProfileColour {
  label: string;
  value: string;
}

export interface ProfileTypeface {
  label: string;
  /** What it is used for. `null` when the brand recorded the face and not the job. */
  note: string | null;
}

export interface BrandProfile {
  id: string;
  name: string;
  /**
   * `brands.description` — the nullable column edited in the identity sheet.
   *
   * Carried even though the TL;DR usually says the same thing, because `brandDescriptionLine`'s
   * precedence needs both to apply it: **the TL;DR wins**, and the description is the older,
   * weaker copy of the same sentence. The identity band renders this only when the TL;DR is
   * unwritten, so the page never prints one brand summary twice.
   */
  description: string | null;
  /** `brands.website_url`. `null` renders no link rather than an empty one. */
  websiteUrl: string | null;
  /** Business date, as {@link ProfileSection.updatedAt}. */
  updatedAt: string;
  /**
   * Every guideline section the brand has, written or not, in the order the API returned them —
   * `priority`. The page decides where each one goes; ordering is `profile.ts`'s job.
   */
  sections: ProfileSection[];
  /**
   * **Both are empty today, deliberately.** Colours and typefaces are `BrandAsset` rows behind
   * `GET /brands/:id/assets`, and the integration was asked to leave assets alone. Nothing
   * degrades: `VisualIdentityBand` renders nothing when both are empty and the identity band's
   * palette strip hides itself, so the page loses two bands rather than gaining two empty states.
   * Filling them is one request and one filter in `map.ts`.
   */
  colours: ProfileColour[];
  typefaces: ProfileTypeface[];
  /** The last completed deep-research run, or `null` for a brand that has never had one. */
  research: { completedAt: string } | null;
}
