import { sql } from 'drizzle-orm'
import { check, date, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { decks } from './decks'

// Member list duplicated with `DeckSourceSchema` in `@brandfactory/shared`,
// per the zod-⇄-pgEnum convention; the shared test pins both lists.
export const deckSource = pgEnum('deck_source', ['pdf', 'canva'])

// One version in a deck's stack. Append-only: Phase 2C's create adds a new
// version and never edits or removes an old one, which is why there is no
// `updatedAt` here to go stale.
//
// **The snapshot is not a second source.** The requirement says "each version
// is one source" and then puts a PDF beside a Canva link; both are right. The
// source is where the design lives and stays editable, and the PDF beside a
// Canva link is a frozen copy of it.
//
// This row holds a url AND a blob_key, which is precisely what
// `brand_assets_source_exactly_one` forbids — and that constraint is why decks
// cannot live in `brand_assets` at all.
//
// `deck_id` cascades: deleting a deck takes its stack with it, and there is
// nothing left for an orphaned version to describe.
export const deckVersions = pgTable(
  'deck_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    source: deckSource('source').notNull(),
    label: text('label').notNull(),
    // `date`, not `timestamp` — `outlets.target_opening_date`'s reason: the
    // team typed a day, not an instant two zones would read as two different
    // days. This is also the column `byVersionRecency` (`@brandfactory/shared`)
    // orders by first.
    versionDate: date('version_date', { mode: 'string' }).notNull(),
    // Text, not a FK to `users` — the author of a brand deck is frequently an
    // agency that will never hold a row in `users`, and a FK would write
    // `null` into the one field the version history is read for.
    author: text('author').notNull(),
    // Exactly one shape of these two, per `source` — enforced by the CHECK
    // below and by the shared union at the wire. See the module docstring on
    // why `'canva'` requires both rather than just `canva_url`.
    pdfBlobKey: text('pdf_blob_key'),
    canvaUrl: text('canva_url'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The read path: a deck's versions, newest-typed first — the same order
    // `byVersionRecency` computes in `@brandfactory/shared`, with the same
    // `created_at` tie-break as its second column.
    index('deck_versions_deck_date_idx').on(
      table.deckId,
      table.versionDate.desc(),
      table.createdAt.desc(),
    ),
    // The belt-and-braces half of the source-shape rule — `brand_assets`
    // sets the standard: a CHECK nobody has seen fire is a CHECK that may not
    // exist. There is a live test that inserts each violating shape directly
    // and expects Postgres to refuse it.
    check(
      'deck_versions_source_shape',
      sql`(
        (${table.source} = 'pdf'   AND ${table.pdfBlobKey} IS NOT NULL AND ${table.canvaUrl} IS NULL) OR
        (${table.source} = 'canva' AND ${table.canvaUrl}   IS NOT NULL AND ${table.pdfBlobKey} IS NOT NULL)
      )`,
    ),
  ],
)
