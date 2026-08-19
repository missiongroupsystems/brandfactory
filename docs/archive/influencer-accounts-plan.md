# A creator is a person, not an account

## The problem

`Add a creator` asks for a name, **a** handle, **a** platform and **a** follower
count, and the hint under the platform select says the quiet part out loud:

> One row per platform — two accounts are two follower counts.

That was a deliberate simplification when the aggregate landed in 1.40.0, and its
docstring in `packages/shared/src/influencer/influencer.ts` says so:

> The row carries **one** platform, not a set, and that is a deliberate
> simplification of a real many-to-many.

The simplification has three costs, and all three are now being paid.

**A person becomes two rows.** A creator with an Instagram grid and a TikTok
account is two records in the roster, each with half the story. The table says
nineteen creators when the brands work with sixteen people. Filtering by `Beauty`
returns the same person twice. There is nothing linking the two rows: not a
foreign key, not a name match, nothing.

**The URL admits it.** `InfluencerSlugSchema` already documents the failure:

> Known cost: one person on two platforms gives `priyaskin` and `priyaskin-2`,
> and the URL does not say which is which.

**The reach tiers are wrong, not just incomplete.** `features/influencers/tiers.ts`
files each row into one band and the band counts sum to the rows — which is true
of *accounts* and false of people. A creator with 60k on Instagram, 50k on TikTok
and 30k on XiaoHongShu is a mid-tier creator sitting in Micro three times. The
one figure the whole screen sorts, groups and prices by is understated for
exactly the creators who are worth the most.

This is not a Singapore edge case. XiaoHongShu is in the platform enum *because*
this group's creators are on it, and a creator on XHS is on Instagram as well
essentially always.

## The shape

A creator gets a child collection of **accounts**. One creator, one to ten
accounts, each with its own platform, handle, follower count and engagement rate.

```
influencers                          influencer_accounts
  id                                   influencer_id ──┐
  workspace_id                         workspace_id    │  (denormalised, see below)
  slug            ← from the NAME      position        │
  name                                 platform        │
  vertical                             handle          │
  status                               followers       │
  notes                                engagement_rate │
                                                       │
  ├── influencer_brands (unchanged) ───────────────────┘
```

Everything that describes the **person** stays on `influencers`: name, vertical,
status, notes, the brands they are engaged for. Everything that describes an
**account** moves down: platform, handle, followers, engagement rate. Four
columns leave the parent; they are the four the form's two lower sections ask
for.

The record on the wire:

```jsonc
{
  "id": "…", "slug": "priya-raman", "name": "Priya Raman",
  "vertical": "beauty", "status": "active", "brandIds": ["…"], "notes": "…",
  "accounts": [
    { "platform": "instagram",   "handle": "priyaskin",      "followers": 840000, "engagementRate": 1.1,  "url": null },
    { "platform": "tiktok",      "handle": "priyaskin",      "followers": 312000, "engagementRate": 4.2,  "url": null },
    { "platform": "xiaohongshu", "handle": "普莉娅",          "followers": 88000,  "engagementRate": null, "url": "https://…" }
  ]
}
```

## The decisions

### 1. An account is a value object, not an entity

No surrogate id, no timestamps. `(influencer_id, position)` is the primary key,
the wire is a plain ordered array, and a write **replaces the whole list**.

This is `vendor_contacts` exactly, and that table's docstring already argues it:
a `created_at` on a full-replacement child row resets on every unrelated edit of
the parent and then reads as a lie about when something started. The same
argument holds here and the same shape falls out — `replaceVendorContacts` in
`queries/vendors.ts` is the function `replaceInfluencerAccounts` is a copy of.

**When this must change:** the day the import lands (`SyncInfluencersButton` is
still a stated placeholder) and refreshes one account's follower count without
the person editing the record, an account needs its own `metrics_updated_at` —
and a full-replacement write from the form would race it. That is a real future
release, not a reason to build an entity now. It is recorded here so the trade is
visible when it arrives.

### 2. `workspace_id` is denormalised onto the account, to hold the unique key

`influencers_workspace_platform_handle_key` is the one refusal in this aggregate
that only the database can make — the query layer's docstring says so, and 1.40.1
was the release that turned it from a 500 into a 409. The rule it enforces is
*one account per (platform, handle) per workspace*, and after this change the
columns it names live on the child.

A unique index needs every column on one row, so the account carries
`workspace_id`. The alternative — a partial index over a join, or dropping to
`UNIQUE (platform, handle)` globally — either does not exist in Postgres or lets
two workspaces collide.

The cost is one denormalised foreign key kept correct by exactly one function
(`replaceInfluencerAccounts`, which reads it from the parent it was handed). The
column cascades from `workspaces` like every other, so a workspace delete still
takes one statement.

**The error gets better, not just moved.** `InfluencerHandleTakenError` can now
name the creator who already holds the handle, because the conflict is with
another *person's* account rather than with a bare row. That needs a
best-effort `SELECT` before the write for the message; the constraint stays the
correctness boundary and the catch stays the fallback.

### 3. Position 0 is the primary account. There is no `is_primary` column

The table's Creator cell shows a handle under the name, and something has to
choose it.

**Not derived from the largest follower count.** A refreshed number would then
silently change the line that identifies the person, and a creator is known by
the handle they lead with rather than by whichever platform is biggest this
month.

**Not a boolean either**, unlike `vendor_contacts.is_primary`. That table needs a
flag because *order* and *who answers the phone* are two different facts. Here
they are one fact: the form lists accounts in the order somebody put them in, and
the first is the one the person is known by. A flag would need a zod refinement,
a UI control, and a rule about what happens when it is unset — for a fact
`position` already carries.

The form labels the first row `Primary` and offers `Make primary`, which moves
that row to position 0. No new column.

### 4. Reach and engagement are derived, and the derivation lives in `shared`

Two new pure functions beside `byInfluencerReach`:

- **`totalReach(accounts)`** — the plain sum. It double-counts a follower who
  follows the same person on two platforms, and every rate card in the trade does
  the same; the detail page shows the split, so the total is never the only
  figure on screen.
- **`blendedEngagement(accounts)`** — the follower-weighted mean over accounts
  that carry a rate, `null` when none do. Weighted, not a plain average, because
  an 88k XHS account at 6% and an 840k Instagram at 1.1% average to 3.55% and
  describe nobody. Accounts with `null` drop out of *both* halves of the
  fraction, which keeps `null` meaning "nobody has measured it" — the distinction
  `format.ts` says has already cost this aggregate three separate defences.

**Derived on read, never stored, and not sent as a server-computed field.** The
tier is already derived from a number the row carries, and this is the same call
one level down. A `totalFollowers` on the wire would be a sum that can disagree
with the array beside it after a partial write.

The functions live in `@brandfactory/shared` rather than in `web-next` because
**the server needs them too** — it sorts the roster by reach, and reach is now a
sum. One definition, one test file, both sides.

**`byInfluencerReach` keeps its contract** (`reach desc, name asc, id asc`) and
reads `totalReach(a.accounts)` instead of `a.followers`.

### 5. The list is sorted in JavaScript, and the reach index goes

`influencers_workspace_followers_idx` cannot survive: there is no `followers`
column to index. Ordering by a sum means a join and a `GROUP BY` in SQL, or a
sort in memory after assembly.

Memory, for now. `listInfluencersByWorkspace` is exhaustive and unfiltered by
design — its docstring already sets the tripwire at roughly 150 rows, where the
keyset cursor and the SQL filters have to land **together**. This change moves
that tripwire closer and does not cross it: the sort is over the same array the
route was already returning whole.

The parent keeps `influencers_workspace_slug_key` and gains
`influencers_workspace_name_idx` for the tie-break; the child gets its unique key
plus the `(influencer_id, position)` primary key that serves the assembly read.

### 6. The slug comes from the name

`influencerSlug(handle)` becomes `influencerSlug(name)`. `/influencers/priya-raman`.

This is the *resolution* of the cost `InfluencerSlugSchema` records rather than a
change of taste. The handle was the source because it identified the account and
the record was an account; the record is now a person, a person has up to ten
handles, and picking one for the URL would re-introduce the arbitrary choice the
whole change removes. Two people who genuinely share a name still get `-2`,
which is what `uniqueSlug` is for.

**Existing slugs do not move.** They are frozen at create and the migration
touches no `slug` value, so every link shared before this release still resolves.
The detail page keeps naming the accounts in its first line, which is now more
useful than it was.

### 7. `url` on the account — included, and here is why it is not scope creep

A handle resolves to a profile URL for five of the six platforms. It does not for
**XiaoHongShu**, which addresses users by an opaque numeric id, and that is the
one platform in this enum somebody cannot reach by guessing. A nullable `url`
column is what makes the XHS account clickable at all.

The screens link the handle when a `url` is present and render plain text when it
is not. Nothing derives a URL from a handle: a wrong link to a real stranger's
profile is worse than no link.

*This is the one item in the plan that can be cut without touching anything else.
If it goes, cut it in Phase A and it never appears.*

### 8. At least one account, at most ten

`min(1)` is the status quo, not a new demand: `handle`, `platform` and
`followers` are all required on the form today. It is also what keeps the tier
grouping **total** — a creator with no account has no reach, would fall out of
every band, and the band counts would stop summing to the rows, which is the one
thing `tiers.ts` says a total grouping may not do.

`max(10)` bounds what one body can write. Twenty was right for
`VendorContactsSchema` because a big agency really has a dozen named people; ten
accounts is already two more than there are platforms in the enum.

**Duplicates inside one body are rejected, not deduplicated** — the same call
`InfluencerBrandIdsSchema` makes. A repeated `(platform, handle)` would take the
unique violation inside the write transaction and surface as a 409 about a
conflict with *another* creator, which is the wrong sentence for a malformed
body. A zod refinement catches it first and says which pair repeated.

Two accounts on the *same* platform are explicitly allowed — three Instagram
accounts is a real creator, and it is the case the current unique key already
permits.

## What is out of scope

Named so nobody has to guess later:

- **No merge action.** The migration gives every existing row its own creator, so
  a person entered twice today stays two creators after it. Nothing can safely
  detect them — two rows sharing a name are two people as often as one.
  Duplicates get merged by hand or by a later release.
- **No per-account history.** One follower count per account, the current one.
- **No import or sync.** `SyncInfluencersButton` stays the stated placeholder it
  is. This change makes the import *possible* to write honestly — a sync per
  account rather than per creator — and does not write it.
- **No rate card and no campaign history.** Neither exists on this server, and
  `influencer-detail.tsx` already records why it will not invent them.
- **The seed is not rewritten.** `SEED_INFLUENCERS` keeps its nineteen invented
  creators, one account each, and gets only the mechanical change that keeps it
  compiling once the four columns move (B5). The curated roster — one person with
  three Instagram accounts, one lifted a tier by their total — is not seeded. Real
  creators are entered in production later, through the form this plan builds.
- **`packages/web` is untouched.** No file in the Vite app names an influencer.
  Production is unaffected until the shell swap.

---

# Implementation plan

Six phases. Each is a commit that type-checks and passes the suite on its own,
except Phase B, which is only green once C lands — noted where it happens.

**One document per phase in `docs/completions/`**, per the repo convention.

## Phase A — the record in `@brandfactory/shared`

The contract first, because `hc<AppType>` makes everything downstream a type
error until it agrees.

### A1. `influencer/influencer.ts`

- [ ] Add `InfluencerUrlSchema` — `z.url().max(500)`, nullable. (Cut with
      decision 7 if that is cut.)
- [ ] Add `InfluencerAccountSchema`: `platform`, `handle`, `followers`,
      `engagementRate` (nullable), `url` (nullable). Reuse
      `InfluencerPlatformSchema`, `InfluencerHandleSchema`,
      `InfluencerFollowersSchema`, `InfluencerEngagementRateSchema` unchanged —
      every rule they carry is an *account's* rule and always was.
- [ ] Add `InfluencerAccountsSchema`: `.min(1).max(10)` plus a refinement
      rejecting a repeated `(platform, handle)` pair, naming the pair in the
      message.
- [ ] `InfluencerSchema`: delete `platform`, `handle`, `followers`,
      `engagementRate`; add `accounts: InfluencerAccountsSchema`.
- [ ] Rewrite the docstrings that state the old simplification — the
      `InfluencerPlatformSchema` block ("The row carries **one** platform…") and
      `InfluencerSlugSchema`'s "Known cost" paragraph. Both now describe the
      opposite decision, and a stale one is worse than none.

### A2. `influencer/reach.ts` (new)

- [ ] `totalReach(accounts): number` — the sum.
- [ ] `blendedEngagement(accounts): number | null` — follower-weighted over
      accounts with a rate; `null` when none. Guard the zero-denominator case (a
      creator whose only measured account has 0 followers).
- [ ] `primaryAccount(accounts): InfluencerAccount` — `accounts[0]`, typed
      non-optional because the array is `min(1)`.
- [ ] `platformsOf(accounts): InfluencerPlatform[]` — distinct, in enum order,
      for the table's chips and the platform filter.
- [ ] Update `byInfluencerReach` to read `totalReach`.

### A3. `influencer/slug.ts`

- [ ] `influencerSlug(name)` / `uniqueInfluencerSlug(name, taken)` — parameter
      renamed, body unchanged. Keep `INFLUENCER_SLUG_FALLBACK = 'creator'`.

### A4. `influencer/create.ts` and `update.ts`

- [ ] Create: drop the four moved keys, add `accounts: InfluencerAccountsSchema`
      (required — a creator with no account is not a record this screen can hold).
- [ ] Update: same four out, `accounts: InfluencerAccountsSchema.optional()` in,
      documented as a **full replacement** like `brandIds`.
- [ ] `index.ts` — export `influencer/reach`.

### A5. Tests — `influencer/influencer.test.ts`, `influencer/reach.test.ts` (new)

- [ ] The account schema accepts a valid row and refuses a leading `@`, a
      negative follower count and a rate over 100 (the existing assertions, moved).
- [ ] `min(1)`, `max(10)`, and the duplicate-pair refusal.
- [ ] Two accounts on one platform with different handles are **accepted**.
- [ ] `totalReach` sums; `blendedEngagement` weights, ignores `null` rates,
      answers `null` when every rate is `null`, and answers the single account's
      own rate when there is one account (parity with the old field).
- [ ] `byInfluencerReach` orders a three-account creator above a one-account
      creator with a bigger single number.
- [ ] The pgEnum ⇄ zod list pin stays as it is.

**Gate:** `pnpm -F @brandfactory/shared test` green. `pnpm typecheck` will now
fail in `db`, `server` and `web-next` — that is the contract working, and B–E
close it.

## Phase B — the table and the migration in `@brandfactory/db`

### B1. Schema

- [ ] `schema/influencer_accounts.ts` — `influencerId`, `workspaceId`,
      `position`, `platform` (the existing `influencerPlatform` enum, reused),
      `handle`, `followers`, `engagementRate` `numeric(5,2)`, `url`.
      `primaryKey({ columns: [influencerId, position] })`, both foreign keys
      `onDelete: 'cascade'`, plus
      `unique('influencer_accounts_workspace_platform_handle_key')` on
      `(workspaceId, platform, handle)`.
- [ ] `schema/influencers.ts` — drop the four columns, drop
      `influencers_workspace_platform_handle_key`, drop
      `influencers_workspace_followers_idx`, add
      `index('influencers_workspace_name_idx')` on `(workspaceId, name)`.
- [ ] `schema/index.ts` — export it.

### B2. Migration 0016 — **generated, then hand-edited**

`pnpm -F @brandfactory/db db:generate` writes the create and the drops. It does
**not** write the backfill, and the drops destroy the data, so the generated file
is edited before it is ever run. Statement order is not negotiable:

1. `CREATE TABLE influencer_accounts …` (generated)
2. Foreign keys and the unique index (generated)
3. **Hand-written:**
   `INSERT INTO influencer_accounts (influencer_id, workspace_id, position, platform, handle, followers, engagement_rate, url) SELECT id, workspace_id, 0, platform, handle, followers, engagement_rate, NULL FROM influencers;`
4. `ALTER TABLE influencers DROP CONSTRAINT influencers_workspace_platform_handle_key;` (generated)
5. `DROP INDEX influencers_workspace_followers_idx;` (generated)
6. `ALTER TABLE influencers DROP COLUMN …` ×4 (generated)

The copy cannot violate the new unique index: `(workspace_id, platform, handle)`
was already unique on the parent. `--> statement-breakpoint` between each, per
the file convention.

- [ ] Add a comment at the top of the SQL saying step 3 is hand-written and why —
      a regenerated migration silently loses it.

### B3. Mappers and queries

- [ ] `mappers.ts` — `rowToInfluencerAccount(row)`, which is where
      `engagement_rate` stops being a `numeric` string (`'3.80'` → `3.8`). This
      is the trap `influencers.ts` names as the aggregate's one shape trap; it
      moves down a level and stays exactly one function.
      `rowToInfluencer(row, brandIds, accounts)`.
- [ ] `queries/influencers.ts`:
  - `replaceInfluencerAccounts(tx, influencerId, workspaceId, accounts)` — delete
    then insert with dense positions, modelled on `replaceVendorContacts`.
  - `accountsForInfluencer(dbOrTx, id)` — ordered by `position`.
  - `listInfluencersByWorkspace` — three queries now (rows, brand joins, accounts),
    two in-memory maps, then `.sort(byInfluencerReach)`. Drop the SQL `ORDER BY
    followers`.
  - `createInfluencer` — slug from `input.name`; write accounts inside the same
    transaction as the brand gate and the row.
  - `updateInfluencer` — `accounts !== undefined` is a full replacement. **The
    read-before-write for the error message changes shape**: the unique key is no
    longer a pair on the row being patched, so the pre-check is a `SELECT` over
    `influencer_accounts` for the submitted pairs, excluding this creator's own
    rows, and it produces the *other creator's name* for the message.
  - `isHandleUniqueViolation` — match
    `influencer_accounts_workspace_platform_handle_key`. Keep the note that
    `influencers_workspace_slug_key` is deliberately not matched.
  - `InfluencerHandleTakenError` — add an optional `holderName`.
- [ ] `deleteInfluencer` — read accounts as well as brand ids before the delete,
      for the same reason the brand ids are read there: the returned row is the
      last copy anything sees.

### B4. Tests — `influencers.live.test.ts`

- [ ] Create with three accounts round-trips in position order.
- [ ] A patch replacing `accounts` removes the ones left out.
- [ ] Two creators, same `(platform, handle)` → `InfluencerHandleTakenError`
      naming the holder.
- [ ] Same `(platform, handle)` on **two accounts of one creator** → refused
      (zod, so it is a Phase C route test; assert the constraint here directly).
- [ ] Two accounts on one platform, different handles → accepted.
- [ ] Deleting a creator cascades the accounts.
- [ ] `listInfluencersByWorkspace` orders a multi-account creator by their total.

### B5. `seed.ts` — the mechanical change only

The seed writes `platform`, `handle`, `followers` and `engagementRate` straight
into the `influencers` insert. B1 drops all four columns, so the seed stops
compiling in this phase and has to move with it. **It is adapted, not rewritten.**

- [ ] `SeedInfluencer` — the four keys become one `accounts` array of a single
      row. Every existing creator keeps the figures they have; nothing is folded,
      nothing is invented, and the count stays nineteen.
- [ ] The seed loop writes the accounts after the parent, before the brand links,
      in the same transaction — the ordering `SEED_VENDORS` already uses for its
      contacts.
- [ ] Slugs stay as they are. They are written out, they are frozen, and the
      docstring line saying each one "is its handle, which is what
      `influencerSlug` would have produced" becomes false in A3 — correct it to
      say the slugs are historical and predate the name-based derivation.
- [ ] `seed.test.ts` — the account count per creator. The `SEED_FIXTURES=false`
      case is uncommitted on `main`; rebase onto it rather than around it.

The curated roster is deliberately not built here. See **What is out of scope**.

**Gate:** live tests need `DATABASE_URL`; run them, they are the point of the
phase. `pnpm typecheck` still fails in `server` and `web-next` until C and D–E.

## Phase C — the routes in `@brandfactory/server`

- [ ] `routes/influencers.ts` — the handlers do not change shape.
      `rethrowWriteConflict` gains the holder's name in the 409 message:
      *"@priyaskin on Instagram is already on **Priya Raman**'s record. Open that
      creator and add the account there, or use a different handle."*
- [ ] `db.ts` — no signature changes; the five function types follow `typeof db`.
- [ ] `test-helpers.ts` — the influencer fixture builder takes `accounts`.
- [ ] Tests — `routes/influencers.test.ts`:
  - Create with two accounts → 201, both back in order.
  - Create with a duplicate pair in the body → 400/422 from zod, naming the pair.
  - Create colliding with another creator → 409, naming the creator.
  - Patch replacing accounts; patch touching only `notes` leaves accounts alone.
  - Create with `accounts: []` → refused.

**Gate:** `pnpm -F @brandfactory/server test` and `pnpm typecheck` green for
`shared`, `db`, `server`. Only `web-next` still fails.

## Phase D — the read surfaces in `web-next`

### D1. `features/influencers/`

- [ ] `tiers.ts` — `tierFor(totalReach(influencer.accounts))` at the call sites;
      the ladder itself does not change. Update the docstring's "a number the row
      already carries" — it is now a number derived from the rows below it, and
      the grouping stays total because `accounts` is `min(1)`.
- [ ] `format.ts` — add `formatAccountCount(n)` (`"1 account"` / `"3 accounts"`)
      and `formatHandle(account)`. `formatEngagement` and `formatFollowers` are
      unchanged and now take the derived figures.
- [ ] `href.ts` — unchanged.

### D2. `influencers-browser.tsx`

- [ ] Columns: **Creator** (name + primary handle + `+2 more` when there are
      others), **Platforms** (text chips, up to three then `+N` — there are no
      brand glyphs in Lucide and inventing them is not this release's job),
      **Reach** (the total, with `formatAccountCount` beneath when > 1), Tier,
      **Engagement** (blended), Vertical, Brands, Status.
- [ ] `matchesFilters` — `platform` becomes *has an account on*, i.e.
      `accounts.some(a => a.platform === filters.platform)`; search matches the
      name **or any account's handle**. Update the `SearchField` label, per the
      AGENTS.md rule that a placeholder must not promise more than the predicate
      delivers — and here it now delivers more.
- [ ] `HighlightMatch` on whichever handle is shown; when the match is on a
      hidden account's handle, show that account's handle instead of the primary,
      so a row never matches invisibly.
- [ ] The footer count is unchanged and stays a true total.

### D3. `influencer-detail.tsx`

- [ ] New **Accounts** card, first in the grid: one row per account with
      platform, `@handle` (linked when `url` is set), exact followers, engagement,
      and a `Primary` badge on the first. This is the page's most important card
      now.
- [ ] **Audience** card becomes the derived view: total reach, blended
      engagement (labelled *blended* — an unlabelled 2.3% over three accounts is
      a number nobody can reproduce), reach tier with its range, vertical.
- [ ] The header's first line names the account count rather than the single
      platform; the paragraph in the docstring about the slug's ambiguity is
      replaced by the one about it coming from the name.

**Gate:** `pnpm -F @brandfactory/web-next typecheck` green except the form.

## Phase E — the form

The one genuinely new UI in this plan.

- [ ] `components/account-rows.tsx` (new) — a repeatable row: Platform select,
      Handle input (with the drawn `@` sigil, unchanged), Followers, Engagement
      rate, URL, and a remove button. `Add account` under the list, capped at ten.
- [ ] The first row carries a `Primary` badge; every other row offers
      `Make primary`, which moves it to index 0. No drag-and-drop — this app has
      one dnd surface and it is the calendar.
- [ ] **The last row cannot be removed.** Disable the button and say why rather
      than letting the submit fail on `min(1)`.
- [ ] Duplicate `(platform, handle)` inside the draft is flagged **on the row**
      before submit. The server refuses it anyway; a form that lets somebody fill
      three fields first is a form that wastes their time.
- [ ] `influencer-form.tsx` — the `Identity` section keeps name and status; the
      `Audience` section becomes `Accounts` and holds the rows; the follower and
      engagement fields leave the top level. Sheet copy is rewritten: *"A creator
      needs a name and at least one account. Add every platform they post on —
      each one carries its own reach."*
- [ ] `FormState.accounts` is an array of **string-valued** rows, per the
      existing rule that numbers are held as strings while the form is open
      (`Number("")` is `0`). Converted once, on submit, through
      `toNullableNumber`.
- [ ] `fieldErrors` from a 422 arrive keyed by path (`accounts.1.handle`).
      `use-submit.ts` flattens to a `Record<string, string>` today — check
      whether the nested key survives, and if it does not, put the message on the
      section rather than dropping it silently.
- [ ] Tests: a new `influencer-form.test.tsx` for add / remove / make-primary /
      last-row-guard / duplicate flag. `tiers.test.ts` and `format.test.ts`
      updated.

**Gate:** the full `web-next` gate — `lint && typecheck && build`.

## Phase F — verify, release

- [ ] Full repo gate: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
      `pnpm test`, `pnpm -F @brandfactory/web build`,
      `pnpm -F @brandfactory/web-next build`.
- [ ] Live db tests with `DATABASE_URL` set — the migration's backfill is the one
      thing in this plan a unit test cannot cover.
- [ ] **Browser pass**, which this release earns. The seed holds no multi-account
      creator, so the pass **creates one first**: the form with three accounts,
      then that creator's detail page, `/influencers` grouped and flat, the 409 on
      a handle another creator holds, the platform filter, and a search that
      matches a non-primary handle.
- [ ] `docs/completions/` — one document per phase.
- [ ] `docs/changelog.md` — index line plus the full entry. **Migration 0016.**
      State the test count.

---

## Risks, and what each one costs

**The backfill is hand-written into a generated file.** If someone regenerates
0016 after writing it, the `INSERT` disappears and the migration silently drops
every follower count in the database. Mitigated by the comment at the top of the
SQL and by the live test that seeds, migrates and asserts the copy — but it is
the single highest-consequence line in this plan.

**Sorting moved from an index to memory.** Correct at nineteen rows, correct at a
hundred and fifty, wrong at a thousand — and the failure is slow, not broken,
which is the kind that gets noticed late. The tripwire is already written down in
`listInfluencersByWorkspace`; this change makes it nearer without crossing it.

**The tier bands shift under existing data.** After the migration nothing moves,
because every creator has one account and their total is their old figure. They
move the first time somebody folds two rows into one person — which is the point,
and is worth saying in the changelog so a reader who knew the old counts is not
confused by the new ones.

**Blended engagement is a number nobody can check by eye.** Labelled *blended* on
the detail page and shown beside the per-account rates it came from, so it is
always reproducible from what is on the same screen. If that still reads as
magic, the fallback is to show the primary account's rate at creator level and
drop the blend — a one-file change in `reach.ts`, deliberately isolated there.

**Existing duplicate people stay duplicated.** The migration cannot merge them
and will not guess — in the seed and in a real workspace alike. Merging means a
person opening two records and re-entering one. A merge action is a later release
if it is ever needed twice.
