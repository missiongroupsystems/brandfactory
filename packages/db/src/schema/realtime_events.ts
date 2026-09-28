import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// realtime_events — the cross-instance backplane's carrier, not a log
// ---------------------------------------------------------------------------
//
// `native-ws` holds its subscribers in the memory of one process, so a message
// published on one machine never reaches a socket attached to another. This
// table is how a publish crosses: the publishing instance inserts the event and
// `NOTIFY`s its id, every other instance reads the row and fans it out to its
// own local subscribers.
//
// **Why a row rather than the payload in the `NOTIFY` itself.** Postgres caps a
// notification payload at 8000 bytes. Most events fit; a `canvas-op` carrying a
// block with a ProseMirror body, or a long assistant message, does not. A
// design that works for most events and silently fails for the biggest and most
// interesting ones is the exact failure class this codebase keeps refusing —
// the id is always small, and the row has no limit.
//
// **This is not an audit log and nothing reads it after the fan-out.** Rows are
// swept an hour after they are written. The realtime contract is at-most-once
// by design: `useProjectStream` invalidates and refetches on every reconnect,
// so a client that misses an event during a gap recovers by asking again. That
// is what lets this table stay disposable rather than becoming a second copy of
// the canvas.
export const realtimeEvents = pgTable(
  'realtime_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The channel the event was published on, e.g. `project:<uuid>`. Not a
    // foreign key: a channel is a routing string the bus invents, and it is
    // deliberately not tied to any one aggregate.
    channel: text('channel').notNull(),
    // The `RealtimeEvent` as it went onto the wire. `jsonb` rather than `text`
    // so a malformed row is refused at write time rather than at fan-out.
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The sweep's read path, and the only query that is not by primary key.
    index('realtime_events_created_at_idx').on(table.createdAt),
  ],
)
