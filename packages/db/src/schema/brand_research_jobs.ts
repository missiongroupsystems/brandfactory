import { sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { brands } from './brands'

// The job's own status vocabulary, which is **ours and wider than any vendor's**
// (see `ResearchStatus` in `@brandfactory/shared`). `NO_FINDINGS` is a completed
// run to every finder alive; it is this layer that decides a report saying "the
// site gave me nothing" is a distinct outcome from one that says something.
//
// `IDLE` is deliberately absent: a brand nobody has researched has **no row**,
// which is what makes the hub's "never researched" state cost nothing to render.
export const researchJobStatus = pgEnum('research_job_status', [
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'NO_FINDINGS',
  'CANCELLED',
])

/**
 * One research run, persisted — **because the job outlives the request, and the
 * browser.** Deep research took 4.0 minutes in 3A's live spike and the vendor
 * documents 3–15, which is longer than plenty of people leave a tab open. A row
 * is what lets the result be waiting when you come back (decision 7), and it is
 * also the only honest place for the one-active-job-per-brand guard: process
 * memory, as `AgentConcurrencyGuard` uses, is emptied by the restart that
 * happens mid-run.
 *
 * **`provider` and `model` are recorded on the row, not read from env at read
 * time.** A job that ran on `sonar-deep-research` last month must still say so
 * after the operator switches models, or the cost ledger below describes a run
 * that never happened.
 */
export const brandResearchJobs = pgTable(
  'brand_research_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    status: researchJobStatus('status').notNull().default('IN_PROGRESS'),
    // Free text rather than an enum: the provider set lives in
    // `RESEARCH_PROVIDER_IDS` in the adapter, and a `pgEnum` here would need a
    // migration every time that list grows — for a column nothing branches on.
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    // What the run was given: the brand name and website as they were **at
    // submission**. A brand renamed mid-run must not make its own report look
    // like it researched the wrong company.
    input: jsonb('input').notNull(),
    // The vendor's job id. Null between insert and a successful `start()` —
    // which is the window the reconciler has to be able to recognise.
    externalId: text('external_id'),
    report: text('report'),
    citations: jsonb('citations'),
    drafts: jsonb('drafts'),
    error: text('error'),
    // **The ledger decision 12 asked for, made billable by 3A.** The vendor
    // reports its own per-run cost, so this is a recorded number rather than an
    // estimate — `numeric` because money in a float is a bug waiting for a
    // rounding, and nullable because "we do not know" must never read as zero.
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    // The hub's read: this brand's latest job, whatever state it is in.
    index('brand_research_jobs_brand_created_idx').on(table.brandId, table.createdAt.desc()),
    // Both of the guards that run before an outbound call, and the ticker's
    // sweep. All three ask the same question — which jobs are still in flight —
    // so they share one partial index rather than each scanning the table.
    //
    // **`unique`, as of migration 0006 — the index is the guard, not just its
    // fast path.** `hasActiveResearchJob` is a `SELECT` followed by an `INSERT`,
    // which is a check-then-act with a window between the two, and what fits in
    // that window is a second $0.40 vendor submission. Two clicks inside one
    // round trip was enough: neither request saw the other's row, both passed,
    // both submitted. A partial unique index is the only place that race can be
    // settled, because it is the only participant that sees both writes.
    //
    // Partial on `IN_PROGRESS` so it constrains exactly what the guard means: a
    // brand may have any number of *finished* runs and at most one in flight.
    uniqueIndex('brand_research_jobs_in_flight_idx')
      .on(table.brandId)
      .where(sql`${table.status} = 'IN_PROGRESS'`),
  ],
)
