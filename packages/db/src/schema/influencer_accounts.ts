import { integer, numeric, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core'
import { influencerPlatform, influencers } from './influencers'
import { workspaces } from './workspaces'

// The accounts a creator posts from — the Instagram grid, the TikTok, the
// XiaoHongShu page nobody can reach by guessing a URL.
//
// **This table is the correction of a simplification `influencers` carried for
// three releases.** The parent held one platform, one handle and one follower
// count, so a creator on two platforms was two unrelated rows: the roster
// double-counted people, a `Beauty` filter returned the same person twice, and
// the reach tiers — the one figure the screen sorts, groups and prices by — filed
// a mid-tier creator into `Micro` three times. Four columns moved down here and
// none of them was widened on the way.
//
// **A value object, not an entity, and the columns it does not have say so.** No
// surrogate id and no timestamps: the write replaces the whole list, so a
// `created_at` would reset on every unrelated edit of the creator and read as a
// lie about when the account started. `(influencer_id, position)` is the key and
// the wire is a plain ordered array — `vendor_contacts` is the precedent this
// table is a copy of, one aggregate over.
//
// **Position 0 is the account the creator is known by**, and there is no
// `is_primary` column. `vendor_contacts` needs the flag because *where a row sits
// in the list* and *who answers the phone* are two different facts; here they are
// one fact. Deriving the primary from the largest follower count instead would let
// a refreshed number silently change the line that identifies the person.
//
// The whole list goes with the creator by cascade, and with the workspace by the
// second cascade below. An account with no person is not a record this table can
// describe.
export const influencerAccounts = pgTable(
  'influencer_accounts',
  {
    influencerId: uuid('influencer_id')
      .notNull()
      .references(() => influencers.id, { onDelete: 'cascade' }),
    // **Denormalised from the parent, and it exists to hold the unique key
    // below.** A unique index needs every column on one row, and the rule being
    // enforced — one account per (platform, handle) per workspace — names a
    // workspace. The alternatives are a partial index over a join, which Postgres
    // does not have, or a global `UNIQUE (platform, handle)`, which lets two
    // workspaces collide on a handle neither has ever heard of.
    //
    // Exactly one function writes it: `replaceInfluencerAccounts`, which reads it
    // from the parent it was handed rather than from its caller's argument.
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // The order the form sent them, which is the order they are read back in.
    // Dense from 0 because the write replaces the list: there is no gap for a
    // removed row to leave behind.
    position: integer('position').notNull(),
    platform: influencerPlatform('platform').notNull(),
    // Without the `@`. Every surface adds the sigil, and `InfluencerHandleSchema`
    // rejects a leading one rather than stripping it, so the column holds one
    // spelling of a handle and the unique key below means what it says.
    handle: text('handle').notNull(),
    // **Not nullable**, and that is what keeps the screen's reach-tier grouping
    // total: a creator's reach is the sum over these rows, the account list is
    // `min(1)`, so every creator lands in exactly one band. `integer` and not
    // `bigint` — 2.1 billion is above every follower count on any platform, and a
    // sum of ten of them is still inside it.
    followers: integer('followers').notNull(),
    // A percent — `3.80` is 3.8%. `null` = nobody has measured **this account**,
    // which is a real state: a creator can have a measured Instagram and an
    // unmeasured XiaoHongShu, and `blendedEngagement` drops the second out of both
    // halves of the fraction rather than reading it as a zero.
    //
    // `numeric` rather than `real` because a rate is quoted to two decimals and a
    // float would render 3.8 as 3.7999999. **It comes back from `node-postgres` as
    // a string** — `'3.80'`, not `3.8` — and `rowToInfluencerAccount` is what
    // converts it. That conversion is this aggregate's one shape trap: it
    // type-checks clean either way and reaches the screen as `3.80%` in a column
    // of `3.8%`. The trap moved down a level with the column and is still exactly
    // one function.
    engagementRate: numeric('engagement_rate', { precision: 5, scale: 2 }),
    // The profile URL, `null` where nobody has recorded one — which is most rows.
    //
    // A handle resolves to a URL by guessing on five of the six platforms and not
    // on **xiaohongshu**, which addresses users by an opaque numeric id. This
    // column is what makes an XHS account clickable at all. Nothing derives a URL
    // from a handle anywhere: a wrong link to a real stranger's profile is worse
    // than no link.
    url: text('url'),
  },
  (table) => [
    primaryKey({ columns: [table.influencerId, table.position] }),
    // One account per (platform, handle) per workspace — **the rule that moved
    // down with the columns**, and still the one refusal on this aggregate that
    // only the database can make. `influencers_workspace_platform_handle_key` is
    // dropped in the same migration; this is that constraint, one table lower.
    //
    // Two accounts on the *same* platform with different handles stay legal:
    // three Instagram accounts is a real creator.
    unique('influencer_accounts_workspace_platform_handle_key').on(
      table.workspaceId,
      table.platform,
      table.handle,
    ),
  ],
)
