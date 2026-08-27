/**
 * The six stages a brand's funnel starts with.
 *
 * **A suggestion, not an installation.** The request calls the set editable, so these are written
 * as rows a brand then owns — renamed, reordered, deleted. A brand that runs five stages should not
 * have to delete one the database gave it unasked.
 *
 * **Order is the whole subject.** *"Ordered stages"* is what the request asks for, and a journey
 * read out of order is not a journey — which is why `funnel_stages` carries a `position` where
 * `brand_resources` and `decks` deliberately do not.
 *
 * This constant is the single source. Migration 0010's `CASE` is **not** the precedent for putting
 * these in SQL: that backfill *derived* a value already implied by `kind` and `role`, and its own
 * docstring calls even that duplication "a real hazard". Six stage names in SQL derive nothing —
 * they are product copy, written a second time, in the one language that cannot import this file.
 * What covers brands that already exist is the screen's empty state, not a migration.
 */
export const DEFAULT_FUNNEL_STAGES = [
  'Awareness',
  'Interest',
  'Consideration',
  'Conversion',
  'Loyalty',
  'Advocacy',
] as const

/** Sparse ints, as `guideline_sections.priority` already is — room to insert between two. */
export const FUNNEL_STAGE_POSITION_STEP = 100
