# Influencer accounts Phase B — the table and the migration

**The child table exists, the four columns are gone, and every follower count in the database
survived the move.**

Phase B of [`./influencer-accounts-plan.md`](./influencer-accounts-plan.md).
Nothing on a screen changed and nothing can until Phase D. What landed is `influencer_accounts`,
**migration 0016** with a hand-written backfill, two mappers, three new query helpers, and the
seed's mechanical move.

`@brandfactory/db`: **190 tests — 189 passed**, 147 of them live tests that skip without
`DATABASE_URL`. All were run against real Postgres, twice: once on the dev database that carries
the pre-migration rows, and once on a database created empty and migrated from 0000. The one
failure is `outlets (live DB) > lists a workspace in name order` and it is **pre-existing** — see
§8.

9 files: 7 modified, 2 new (1 of them generated, then hand-edited).

**`pnpm typecheck` still fails in `server` and `web-next`.** Phase C closes the first.

---

## 1. The table

```
influencer_accounts
  influencer_id   uuid    → influencers.id   ON DELETE CASCADE  ┐ primary key
  position        int                                          ┘
  workspace_id    uuid    → workspaces.id    ON DELETE CASCADE  ┐
  platform        influencer_platform                           │ unique key
  handle          text                                          ┘
  followers       int
  engagement_rate numeric(5,2)
  url             text
```

`vendor_contacts` is the table this is a copy of: no surrogate id, no timestamps,
`(parent_id, position)` as the key, and a write that replaces the whole list. The plan argues the
shape and Phase A's note argues the wire; neither is repeated here.

**Two things are not copies of `vendor_contacts`, and both are decisions:**

**`workspace_id` is denormalised onto the child.** The rule being enforced is *one account per
`(platform, handle)` per workspace*, a unique index needs every column on one row, and the
workspace is two tables up. The alternatives are a partial index over a join — which Postgres does
not have — or a global `UNIQUE (platform, handle)`, which lets two workspaces collide on a handle
neither has heard of. The cost is one column kept correct by exactly one function, and it cascades
from `workspaces` like every other, so a workspace delete is still one statement.

**There is no `is_primary`.** `vendor_contacts` needs the flag because *where a row sits in the
list* and *who answers the phone* are two different facts. Here they are one fact: position 0 is
the account the creator is known by. Deriving the primary from the largest follower count instead
would let a refreshed number silently change the line that identifies the person.

### What left `influencers`

Four columns, one unique constraint, one index:

- `handle`, `platform`, `followers`, `engagement_rate` — they describe an account.
- `influencers_workspace_platform_handle_key` — the same constraint now sits on the child, under
  `influencer_accounts_workspace_platform_handle_key`. It is the one refusal on this aggregate only
  the database can make, and it did not weaken in the move: `(workspace_id, platform, handle)`
  either side.
- `influencers_workspace_followers_idx` — **there is no `followers` column to index.** Ordering by
  a sum means a join and a `GROUP BY` in SQL, or a sort in memory after assembly; §4 takes the
  second. `influencers_workspace_name_idx` on `(workspace_id, name)` arrives for the tie-break.

---

## 2. Migration 0016, and the one line that could destroy data

`db:generate` wrote the create, the two foreign keys, the drops and the new index. It did not write
the backfill, and **the generated statement order put the drops before the foreign keys**, so the
file was reordered as well as extended. The order that ships is not negotiable:

1. `CREATE TABLE influencer_accounts …` — with the primary key and the unique key inline
2. the two foreign keys
3. **hand-written:** `INSERT INTO influencer_accounts … SELECT id, workspace_id, 0, platform, handle, followers, engagement_rate, NULL FROM influencers;`
4. `DROP CONSTRAINT influencers_workspace_platform_handle_key`
5. `DROP INDEX influencers_workspace_followers_idx`, `CREATE INDEX influencers_workspace_name_idx`
6. `DROP COLUMN` ×4

A 20-line comment sits at the top of the SQL in a box of `=` characters, and it says the one thing
a reader has to know: **regenerating this file deletes statement 3, and the migration then destroys
every follower count in the database.** That is the highest-consequence line in the whole plan, and
a comment is the only thing that travels with the file.

The copy cannot violate the new unique key: `(workspace_id, platform, handle)` was already unique
on the parent. `url` is `NULL` on every copied row, because nothing derives a profile URL from a
handle.

**It was run, not reasoned about.** On the dev database, before and after:

| | before | after |
| --- | --- | --- |
| creators | 19 | 19 |
| account rows | — | 19, all at `position = 0` |
| sum of followers | 5,451,390 | **5,451,390** |
| measured engagement rates | 16 | 16 |

Every creator has exactly one account and their total is their old figure, so **no reach tier
moves on the day this runs**. Tiers move the first time somebody folds two rows into one person,
which is the point of the change and belongs in the changelog rather than in a migration.

The chain also applies from zero: a database created empty and migrated 0000 → 0016 runs the
backfill over an empty table and takes the whole live suite afterwards.

---

## 3. The mappers

`rowToInfluencerAccount(row)` is where `engagement_rate` stops being a `numeric` string — `'3.80'`
becomes `3.8`. **The aggregate's one shape trap moved down a level with the column and is still
exactly one function**, which is what keeps it a trap somebody can find. It type-checks clean
either way, and the symptom is one row reading `3.80%` in a column of `3.8%`.

It drops three columns rather than two: `position` is the array index, `influencerId` is the record
the list hangs off, and `workspaceId` is a denormalisation that holds a unique key — not a fact a
client needs. Sending any of them would let a client believe it can address an account on its own,
which the full-replacement write is built not to offer.

`rowToInfluencer(row, brandIds, accounts)` takes a third parameter and **writes no reach figure of
its own**. Both derived numbers stay in `@brandfactory/shared`, computed on read, on both sides of
the wire.

---

## 4. The queries

Three new functions and five changed ones.

**`replaceInfluencerAccounts(tx, influencerId, workspaceId, accounts)`** — delete, then insert with
dense positions. It does not touch the order: `position` is the array index and index 0 is the
account the person is known by, so a re-sort here would rename them on every screen.

It **returns the written rows rather than its argument**, and that is the one place it departs from
`replaceVendorContacts`. `numeric(5,2)` rounds `3.456` to `3.46` on write; echoing the body would
hand back a figure the table does not hold, which the next read then contradicts. A contact is five
text columns and has no such gap. The live test that pins this is the one that submits `3.456`.

**`accountsForInfluencer(dbOrTx, id)`** — ordered by `position`, for the reads that hold one row.

**`findAccountHolder(tx, workspaceId, accounts, exclude)`** — a `SELECT` over the child table joined
to its parent, for **the message and only for the message**. The unique index stays the correctness
boundary: this read and the insert are not atomic against a concurrent writer, and the `catch` is
what actually refuses the duplicate. What the read buys is the sentence — *"@priyaskin on Instagram
is already on Priya Raman's record"* instead of *"handle already used"*. `exclude` is the creator
being patched, because resubmitting a list you already hold is not a conflict with yourself.

`InfluencerHandleTakenError` gains `holderName: string | null`. **Optional on purpose**: a
concurrent write can still take the violation with nothing to name, and the route drops the clause
rather than inventing a holder.

`isHandleUniqueViolation` matches the new constraint name. The note about
`influencers_workspace_slug_key` deliberately not being matched is unchanged and still true.

**`listInfluencersByWorkspace` is three queries, two maps and a `.sort(byInfluencerReach)`** — the
shape `listVendorsByWorkspace` already uses for its two relations. The SQL `ORDER BY` is gone
because the sort key is a sum. The docstring keeps the tripwire it already carried and says
plainly that this change moves it nearer without crossing it: past roughly 150 rows the keyset
cursor and the SQL filters land together, and a keyset cursor on a derived sum is the harder half
of that work.

`createInfluencer` slugs from `input.name` and writes the accounts inside the same transaction as
the brand gate, the row and the links. `updateInfluencer` treats `accounts` as a full replacement
and leaves them alone when the key is absent — which is what makes a patch of `notes` safe.
`deleteInfluencer` reads the accounts as well as the brand ids before the delete, because the
returned row is the last copy anything sees and the cascade takes the rest.

---

## 5. The seed — adapted, not rewritten

`SEED_INFLUENCERS` keeps its nineteen invented creators and every figure they had. The four keys
became a one-row `accounts` array per creator; nothing was folded, nothing was invented, and the
count is still nineteen. `SeedInfluencerAccount` is a new interface beside it.

The write loop puts the accounts **after the parent and before the links**, the ordering
`SEED_VENDORS` already uses for its contacts, with `ON CONFLICT DO NOTHING` on
`(influencer_id, position)` — the third composite-key insert in this file.

Two docstring corrections, both load-bearing:

- The slugs are now described as **historical**. Each is its handle, which is what `influencerSlug`
  produced while the handle was the source; it is the name now, and the values are left exactly as
  they are for the reason migration 0016 touches no `slug` in a real database.
- `url` is `null` on every account, because these handles resolve to nothing at all.

**The curated roster is deliberately not built.** One person with three accounts, lifted a tier by
their total, is the fixture this table now makes possible — and these are invented people, so a
multi-account fixture would be a more elaborate fiction rather than a better one. The plan lists it
under *What is out of scope*.

`SEED_FIXTURES=false` is untouched and still writes the brands and the outlets and nothing invented.

---

## 6. The tests

`mappers.test.ts`: 43 tests. The influencer block split in two — `rowToInfluencerAccount` takes the
`numeric` trap and the dropped columns, `rowToInfluencer` keeps the timestamps and the brand ids and
gains two cases: the accounts arrive in the caller's order, and the record carries **no**
`followers`, `engagementRate`, `platform` or `handle` of its own.

`influencers.live.test.ts`: 29 tests, rewritten around the new shape. Seven are new:

- three accounts round-trip in position order, xiaohongshu's `url` included
- two accounts on one platform with different handles are accepted
- one creator carrying the same pair twice is refused **at the constraint** — the body bypasses zod
  on purpose, which is what makes the zod rule a better message rather than the only defence
- a patch replaces the whole list and drops the rows left out, read back from the table
- a patch reorders the accounts, because position 0 is a fact
- the list orders a three-account creator (60k + 50k + 30k) above a one-account creator on 100k —
  the defect this change exists to fix, asserted against real SQL
- a delete takes the accounts with it, proved by re-creating the freed `(platform, handle)` pair

The 409 test now asserts `holderName`, and the slug tests moved from *one person on two platforms*
to *two people who share a name*.

`seed.test.ts` gains the account count (19, all at position 0) and asserts that the flag-off seed
writes no account either.

**One test was made hermetic rather than only extended.** The `SEED_FIXTURES=false` case relied on
being declared first: every insert is `ON CONFLICT DO NOTHING`, so a creator written by an earlier
`seed()` stays written, and `influencers.live.test.ts` and `vendors.live.test.ts` both call `seed()`
in a `beforeAll`. Whichever file the runner reached first decided whether the assertion read 0 or
19 — it read 19 on a clean database. It now deletes the two fixture tables for the demo workspace
before seeding with the flag off, which is what it was always trying to assert, and the case passes
in any order.

---

## 7. Files

| File | |
| --- | --- |
| `schema/influencer_accounts.ts` | **new** — the table |
| `schema/influencers.ts` | four columns, one constraint and one index out; one index in |
| `schema/index.ts` | one export |
| `drizzle/0016_outstanding_lionheart.sql` | **new, generated then reordered and extended** |
| `mappers.ts` | `rowToInfluencerAccount` new; `rowToInfluencer` takes accounts |
| `queries/influencers.ts` | three helpers new, five functions changed |
| `seed.ts` | the mechanical move |
| `mappers.test.ts`, `influencers.live.test.ts`, `seed.test.ts` | above |

---

## 8. Gate

| | |
| --- | --- |
| `tsc --noEmit -p packages/db/tsconfig.json` | clean |
| `pnpm exec eslint packages/db/src` | clean |
| `pnpm exec prettier --check packages/db/src packages/db/drizzle` | clean |
| db project, `DATABASE_URL` set, migrated dev database | 189 passed, 1 failed |
| db project, `DATABASE_URL` set, database created empty and migrated 0000 → 0016 | 189 passed, 1 failed |
| db project, no `DATABASE_URL` | 43 passed, 147 skipped |

**The one failure is `outlets (live DB) > lists a workspace in name order`, and it is not this
change.** It asserts `Willow` before `temper. Duxton`, which is C-collation ordering; both databases
in the dev container are `en_US.utf8` and sort them the other way. No file this phase touched is
involved — the outlet seed, the outlet query and that test are all unchanged — and it fails
identically on the pre-migration dev database. It is an environment mismatch worth its own fix,
and it is recorded here rather than folded into this phase.

Next: **Phase C** — the routes, the 409 that names the creator, and the server's fixture builder.
