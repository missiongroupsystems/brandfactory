import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * A structure write to Passport that **failed and may be retried**.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 9c.
 * Proposal: `docs/executing/passport-sync-consumer-proposal.md` §7.
 *
 * ---------------------------------------------------------------------------
 * Why this is not a rule-7 shadow, and what would make it one
 * ---------------------------------------------------------------------------
 *
 * A unit's name is a Passport fact. A table of *proposed* names would therefore be a
 * shadow — a second place a brand's name lives, which some screen eventually reads because
 * it is nearer than the projection.
 *
 * Four properties keep this on the right side of that line, and **all four are load-bearing
 * together**:
 *
 * 1. **A row exists only AFTER a write has failed.** There is no pending-write row on the
 *    happy path, so this is never "where a change lives while it is being saved". It holds
 *    attempted operations, not state.
 * 2. **Nothing reads it except the retry UI.** No brand list, no name resolution, no
 *    authorization check. The brand list always reads `passport.unit`.
 * 3. **A row is deleted on success**, so it cannot accumulate into a parallel model.
 * 4. **A row expires.** An attempt nobody retried within the window was abandoned, and
 *    keeping it forever turns the retry screen into a graveyard nobody trusts.
 *
 * The failure mode to watch for is a screen joining this table to `passport.unit` to show
 * "the name it will have". That is the shadow arriving, and it will look like a feature.
 *
 * It lives in `public`, like `passport_login_attempts` and for the same reason: nothing here
 * arrives from a sync event, so it is app-owned data about this app's own failed requests.
 *
 * ---------------------------------------------------------------------------
 * `payload` holds a request body, so it holds nothing secret
 * ---------------------------------------------------------------------------
 *
 * A unit name and a profile — the same fields an Admin typed into a form. **The acting
 * person's Passport access token is NEVER stored here**, which is also why a retry cannot
 * be a background job: it needs a live token from a live session, so it runs only when an
 * Admin presses the button. That is a constraint, not a limitation to engineer around — a
 * stored token would make this table credential-bearing and let the app write structure
 * with nobody present.
 */
export const passportWriteAttempts = pgTable(
  'passport_write_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Resolved from the acting person's membership, never from configuration (rule 9). A
     * retry must go back to the same org, and an org id read from a setting is the
     * single-org bug arriving through the back door.
     */
    organizationId: uuid('organization_id').notNull(),
    /**
     * Which call failed: `unit.create`, `unit.update`, `unit.archive`,
     * `unit_relation.attach`, `unit_relation.detach`, `unit_app_access.enable`,
     * `unit_app_access.disable`.
     *
     * Deliberately NOT an enum type in the database. The set is this app's own vocabulary
     * for its own queue, and a Postgres enum would need a migration to add an operation
     * while buying nothing — the only writer and the only reader are both in this repo.
     */
    operation: text('operation').notNull(),
    /** The request body as it would be sent. Re-sent verbatim on a retry. */
    payload: jsonb('payload').notNull(),
    /**
     * The unit the operation targets. **Null for a create**, which is the whole reason this
     * is nullable: at the point a create fails, no unit exists to name.
     */
    unitId: uuid('unit_id'),
    /**
     * Who attempted it — a local `users.id`. No foreign key, matching the projection's
     * convention: this row must survive the person leaving, or a departure would silently
     * delete the record of a failed structure change.
     */
    attemptedBy: uuid('attempted_by').notNull(),
    /** Retry count, so a repeatedly failing attempt is visible as such. */
    attempts: integer('attempts').notNull().default(1),
    /**
     * The last failure, for the retry screen. A message, never a response body: Passport's
     * bodies are small but this is the one field a person reads, and a raw JSON blob is not
     * something anybody acts on.
     */
    lastError: text('last_error').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    /**
     * When this stops being offered. Longer than the login attempt's minute, because the
     * outage it survives is measured in hours and the person retrying may not be the person
     * who tried first.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [
    // The retry screen lists one org's attempts.
    index('passport_write_attempts_org_idx').on(table.organizationId),
    index('passport_write_attempts_expires_at_idx').on(table.expiresAt),
  ],
)
