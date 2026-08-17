import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /**
     * The **display label** — `Casa Vostra`, not `Casa Vostra Pte. Ltd.`
     *
     * Decision: proposal §8 `D1-b`, and §5 point 1.
     *
     * **This is NOT a copy of `passport.unit.name`, and it is not expected to track it.**
     * `passport.unit.name` is the LEGAL name: a directory shared with sibling Mission
     * Systems apps and used for statutory output. This is what staff read in every picker,
     * header, report and prompt. The two mean different things and **may differ for ever**,
     * which is why this is rule 7's carve-out rather than a shadow.
     *
     * So a rename in the Passport console deliberately does not reach this column. That is
     * correct, and it is certain to be reported as a bug — which is what phase 9e's drift
     * view exists to make visible.
     *
     * Renaming the legal name is a different action: phase 9's write-through, for org
     * Admins on a hosted-login session.
     */
    name: text('name').notNull(),
    /**
     * The Passport unit this brand corresponds to, or NULL.
     *
     * Plan: phase 8b. Decision: proposal §8 `D1-b`.
     *
     * **NULL means "created here, not yet in Passport"** — a usable, first-class state. It
     * is what makes authoring during a Passport outage possible, which is the requirement
     * `D1-b` exists to meet.
     *
     * Pushed up as `external_ref = brands.id`, because `UnitCreate.id` is super-admin only
     * and BrandFactory therefore cannot choose the unit's UUID. `external_ref` is the only
     * place our own identifier can travel, and it is stable for the brand's whole life — so
     * a replayed create is idempotent and the returning `unit.upserted` can link this row.
     *
     * ⚠️ **UNIQUE, and that constraint is load-bearing.** Without it, two local brands
     * claiming one unit is a silent duplicate rather than an error — the exact failure mode
     * recorded in proposal `D1`.
     *
     * No foreign key to `passport.unit`, for the same reason as the workspace link.
     */
    passportUnitId: uuid('passport_unit_id'),
    description: text('description'),
    // Validated as http/https at the wire boundary (`BrandWebsiteUrlSchema`),
    // stored as plain text: a CHECK here would duplicate a rule that already
    // has one enforcement point and no second writer.
    websiteUrl: text('website_url'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('brands_workspace_id_idx').on(table.workspaceId),
    unique('brands_passport_unit_id_key').on(table.passportUnitId),
  ],
)
