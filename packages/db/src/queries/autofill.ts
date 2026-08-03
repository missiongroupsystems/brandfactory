import type {
  AutofillSource,
  BrandId,
  ResearchSource,
  UserId,
  WorkspaceId,
} from '@brandfactory/shared'
import { and, count, eq, gte, sql } from 'drizzle-orm'
import { db } from '../client'
import { toIsoTimestamp } from '../mappers'
import { brands, sectionAutofillEvents } from '../schema'

// ---------------------------------------------------------------------------
// Section auto-fill events — the ledger written after the spend, read before it
// ---------------------------------------------------------------------------
//
// Two operations, because the table answers two questions: *record that a
// section was filled* (with the provenance the section row itself refuses —
// decision 10), and *how many searches has this workspace bought today* (the
// per-day cap, decision 9). Append-only; nothing updates or deletes an event
// short of the brand cascade.

export interface SectionAutofillEvent {
  id: string
  brandId: BrandId
  label: string
  source: AutofillSource
  model: string
  /** What the vendor said the search cost. `null` is unknown, never zero. */
  costUsd: number | null
  sources: ResearchSource[]
  createdBy: UserId | null
  createdAt: string
}

type Row = typeof sectionAutofillEvents.$inferSelect

function rowToEvent(row: Row): SectionAutofillEvent {
  return {
    id: row.id,
    brandId: row.brandId as BrandId,
    label: row.label,
    source: row.source as AutofillSource,
    model: row.model,
    // `numeric` comes back as a string from pg — parsed at the one boundary
    // that knows the column's scale, same as `brand_research_jobs.cost_usd`.
    costUsd: row.costUsd === null ? null : Number(row.costUsd),
    sources: (row.sources ?? []) as ResearchSource[],
    createdBy: (row.createdBy as UserId | null) ?? null,
    createdAt: toIsoTimestamp(row.createdAt),
  }
}

export interface RecordSectionAutofillInput {
  brandId: BrandId
  label: string
  source: AutofillSource
  model: string
  costUsd: number | null
  sources: ResearchSource[]
  createdBy: UserId | null
}

export async function recordSectionAutofill(
  input: RecordSectionAutofillInput,
): Promise<SectionAutofillEvent> {
  const [row] = await db
    .insert(sectionAutofillEvents)
    .values({
      brandId: input.brandId,
      label: input.label,
      source: input.source,
      model: input.model,
      costUsd: input.costUsd === null ? null : String(input.costUsd),
      sources: input.sources,
      createdBy: input.createdBy,
    })
    .returning()
  return rowToEvent(row!)
}

/**
 * The money guard's count — `countResearchJobsTodayForWorkspace`'s shape, and
 * its rolling-24-hours reasoning verbatim: a calendar day needs a timezone to
 * be a fact, and the server's is not the user's.
 *
 * **Counts only `source = 'search'`.** The cap protects vendor money; Path R
 * re-reads a report already paid for on the user's own LLM tokens, which
 * shaping and chat already spend ungated. A report-fill consuming a search's
 * budget would ration the free path to protect the paid one.
 */
export async function countSectionAutofillsTodayForWorkspace(
  workspaceId: WorkspaceId,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(sectionAutofillEvents)
    .innerJoin(brands, eq(brands.id, sectionAutofillEvents.brandId))
    .where(
      and(
        eq(brands.workspaceId, workspaceId),
        eq(sectionAutofillEvents.source, 'search'),
        gte(sectionAutofillEvents.createdAt, sql`now() - interval '24 hours'`),
      ),
    )
  return row?.n ?? 0
}
