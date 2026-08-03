import { index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { brands } from './brands'

/**
 * One guideline-section auto-fill, recorded — **the spend ledger decision 9
 * chose over a `kind` column on `brand_research_jobs`.** That table's semantics
 * are load-bearing in ways a second row-kind would strain: the partial unique
 * in-flight index, `hasActiveResearchJob`, `getLatestResearchJob` feeding the
 * rail's report row. Threading `WHERE kind='deep'` through every reader is more
 * surface than this four-question event table.
 *
 * **Append-only, and the audit trail sections themselves refuse to be**
 * (decision 10 / Q3): guideline sections stay `{label, body, priority,
 * createdBy}`, so the "where did this come from" facts — which model, what it
 * cost, which sources — land here, keyed by brand and time, without touching
 * the guidelines wire at all.
 *
 * `source` is `'report'` (Path R — the stored deep report, re-read on the
 * workspace's own model) or `'search'` (Path S — a paid vendor search). Only
 * `'search'` rows count against `RESEARCH_SECTION_MAX_PER_DAY`, because the cap
 * protects vendor money and Path R spends none. Free text rather than a
 * `pgEnum`, the `brand_research_jobs.provider` reasoning: a migration per new
 * value, for a column only one query filters on.
 */
export const sectionAutofillEvents = pgTable(
  'section_autofill_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    /** The section that was filled, as clamped by the service. */
    label: text('label').notNull(),
    source: text('source').notNull(),
    /** Which model wrote the draft — recorded, not read from env at read time. */
    model: text('model').notNull(),
    // The vendor's own number where it reports one (Path S); `null` is unknown,
    // never zero — Path R spends the user's own LLM tokens, which nothing here
    // can price. `numeric` because money in a float is a rounding bug waiting.
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
    /** The draft's source list (decision 10) — the provenance the section row drops. */
    sources: jsonb('sources').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The cap's read and any future "where did this come from" affordance ask
    // the same shape: this brand's events, newest first.
    index('section_autofill_events_brand_created_idx').on(table.brandId, table.createdAt.desc()),
  ],
)
