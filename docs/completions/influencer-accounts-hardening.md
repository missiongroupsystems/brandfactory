# Influencer accounts — hardening

**A pre-push review of Phases A–F, and the four things it changed.**

Follows [`./influencer-accounts-phase-f-the-release.md`](./influencer-accounts-phase-f-the-release.md).
No new feature and no migration. What landed is one real defect in the form's submit path, one
error shape that could name the wrong account, one deliberate affordance lost in a move, and two
comments that had gone false. `2584 tests` — 2584 passing with a database, 2437 passing and 147
skipped without one.

The review re-ran the whole gate rather than trusting Phase F's table, and **re-ran the migration
against hand-written pre-migration rows** rather than trusting the backfill note. Both held. What
follows is what did not.

---

## 1. `Number("")` is `0`, and the one line that had forgotten it

**The defect.** `toAccountPayload` in `features/influencers/account-drafts.ts` converted a draft
row's follower box with a bare `Number(draft.followers)`, and its own docstring claimed the result:

> `followers` is `required` on the input and non-nullable in `InfluencerFollowersSchema`, so an
> empty box arrives here as `NaN` rather than being laundered into `0`.

`Number("")` is `0`. `Number("   ")` is `0`. The sentence described a guarantee the line did not
give, and it described it in the one module whose *entire reason to exist* is that distinction —
the `AccountDraft` docstring twelve lines above says so directly:

> `Number("")` is `0`, so a draft holding numbers could not represent an empty box without it
> meaning a follower count of nothing — and a creator silently entered on zero followers lands in
> Nano and looks like a real reading.

So the draft carried its numbers as strings for the whole life of the form, correctly, and then
handed that protection back at the single point where the draft stops being a draft.

**What it would have cost.** A creator entered on zero followers is not a blank cell. It is a
member of the Nano band, it sorts to the bottom of a list read as a budget conversation, and it
reads on screen as a measurement somebody took. That is worse than a refusal and worse than an
empty state, because nothing about it looks wrong.

**Why it had not fired.** The `required` attribute on the followers input stops the submit in a
browser, and `account-rows.tsx` states that correctly at the input. So the trap needed a second
route to the function — a programmatic submit, a future draft restored from storage, a caller
this module invited by being pure and exported. The rule the module is built around should not
depend on one HTML attribute two files away.

**The fix.** Test the emptiness before the conversion, not after it:

```ts
followers: draft.followers.trim() === "" ? Number.NaN : Number(draft.followers),
```

`InfluencerFollowersSchema` is `z.number()`, which **refuses `NaN`** — measured, not assumed:
`Invalid input: expected number, received NaN`. So the three defences now line up in order and
each one is real: the browser stops the submit, this line answers `NaN` if anything gets past it,
and the schema refuses the body with the field named rather than writing a figure nobody typed.
The docstring is now a description of the code instead of a claim about it.

**The test is the point of the change.** `account-drafts.test.ts` gains a case that asserts all
three: `NaN` out of an empty box, `NaN` out of a whitespace box, a **typed `0` surviving intact**
— the same distinction the engagement-rate box makes and the reason `toNullableNumber` exists —
and `InfluencerAccountsSchema.safeParse` refusing the payload. It fails against the old line.

---

## 2. The 409 could name an account that was never in conflict

**The defect.** `InfluencerHandleTakenError` carried three independent fields — `handle`,
`platform`, and a `holderName` that defaulted to `null` — and both call sites filled the gap the
same way:

```ts
throw new InfluencerHandleTakenError(
  holder?.handle ?? input.accounts[0]?.handle ?? '',
  holder?.platform ?? input.accounts[0]?.platform ?? '',
  holder?.name ?? null,
)
```

All three facts come from **one** best-effort `SELECT` before the write, so they are known together
or not at all. The three-field shape could not say that, and `?? input.accounts[0]` is what the
gap got filled with — a guess that is right only for a creator with exactly one account, on an
aggregate whose entire subject is creators with more than one.

**The failure.** Two people enter the same handle at once. Both pre-flight reads see nothing, one
write wins, the loser takes the unique violation on — say — its **third** account. `holder` is
`null`, so the message names `accounts[0]`: a handle that nobody else holds and that is not the
reason the write failed. The reader is told to go and open a creator that does not exist, over a
row that was fine.

There is a second way in, and Phase B's own live test walks it: a body repeating one
`(platform, handle)` against *itself*, cast past zod. The pair collides with the row the same
transaction is writing, so no other creator holds it and the pre-flight read correctly saw
nothing — and the old shape still produced a sentence blaming somebody else.

**The fix.** One nullable object, so the invariant is structural rather than remembered:

```ts
readonly holder: { name: string; handle: string; platform: string } | null
```

Both call sites become `throw new InfluencerHandleTakenError(holder)` — the value the pre-flight
read already returned, passed straight through. There is no gap left to fill, so nothing fills it.

**The route says less, and means it.** `rethrowWriteConflict` had two sentences and now has two
better ones. With a holder it is unchanged, and it is still the sentence this release was built to
make sayable:

> @priyaskin on instagram is already on **Priya Raman**'s record. Open that creator and add the
> account there, or use a different handle.

Without one it names no pair at all:

> One of these accounts is already on the roster in this workspace. Refresh the list and check
> which handle is taken.

That is true in both of the cases that produce it, which the previous fallback — *"@… on … is
already on another creator's record"* — was not: in the self-collision case there is no other
creator. A message that admits it does not know which row is better than a confident one pointing
at the wrong row.

**Three tests moved with the shape**, and one got stricter. The two live tests asserting the flat
fields now assert the nested object, and the self-collision case stopped being a bare
`toBeInstanceOf` and now pins `holder: null` — so the honest answer is asserted rather than merely
possible.

---

## 3. The staleness clause the move dropped

The form's old `Followers` field carried a hint that changed with the record:

```ts
hint={influencer ? `Last updated ${formatDateTime(influencer.updatedAt)}.` : "The count on the platform today."}
```

and its comment called it **"the trap the plan named, and the answer to it"**: a follower count is
pulled from a platform and is stale within the day, so a form showing only the number invites
somebody to stand behind a figure nobody has checked this quarter. The form cannot fix that; what
it can do is say when the figures were last touched.

Phase E replaced that field with ten repeatable rows and the clause did not come with them. No
phase document mentions the loss, which is what makes it worth its own section — the rest of this
change records every trade it makes, and this one was made silently.

**It is restored on the section, not on a row**, and that placement is forced rather than chosen.
An account carries **no timestamp of its own**, deliberately: `influencer_accounts` is a value
object, and a `created_at` on a full-replacement child row would reset on every unrelated edit of
the parent and then read as a lie about when the account started. The parent's `updatedAt` is the
only honest granularity available, and it covers exactly the list of rows underneath it.

The day the import lands — the release that gives an account its own `metrics_updated_at`, already
recorded in `InfluencerAccountSchema` as the thing that will force this table's shape — the clause
moves down to the row and gets more precise. Until then it says what it can prove.

---

## 4. Two comments that had gone false

Both are documentation, and both are load-bearing in a repository where a docstring is the
specification.

**`packages/db/src/schema/vendors.ts`** described its own name index by contrast with
`influencers_workspace_followers_idx` — *"which is the opposite of … and its deliberate `desc`"* —
in the present tense. Migration 0016 dropped that index with the column it named. A reader
following the comparison would have gone looking for an index that no longer exists. It now says
what replaced it: the influencer roster is still read reach-descending, but `byInfluencerReach`
sorts an assembled array in memory over a **sum**, and this table's order is still a column, which
is why the index stays here and went there.

**Phase F §5** stated that the phase notes and the plan "move to `docs/archive/`". They are in
`docs/completions/`, which is correct — the convention archives a feature's documents when the
**next** feature lands, which is exactly what this commit does for `vendors-on-real-data` and
`brand-scoped-sidebar`. The sentence described the wrong half of the rule.

---

## 5. One finding examined and left alone, with the reasoning kept

**Nothing in the database enforces that a creator has at least one account**, and `primaryAccount`
throws on an empty list — during **render**, on both screens. So a creator emptied by direct SQL
does not produce a bad row; it produces an error page where the roster was.

`influencer_accounts` cannot express this rule. A `CHECK` constraint sees one row and this is a
statement about the *absence* of rows in another table — the aggregate's one `CHECK` precedent,
`brand_assets_source_exactly_one` in migration 0004, works precisely because both of the columns it
compares are on the row it guards. Enforcing "the parent has at least one child" needs a **deferred
constraint trigger**, which is machinery this schema has never used once in seventeen migrations,
and which would have to be deferred to allow the delete-then-insert that
`replaceInfluencerAccounts` is built on.

Against that: every write path goes through `InfluencerAccountsSchema`, which is `.min(1)`; the
migration's backfill gives every existing row exactly one account; and the cascade removes accounts
only along with the creator. The invariant is held everywhere it can be reached from the product.

**And the crash is arguably the right behaviour.** The alternative — a nullable return with a
fallback at each call site — renders a creator with no handle and no reach as though that were a
state the record can hold, on the one screen whose numbers are read as claims. Loud beats quiet
for data that should not exist. `primaryAccount`'s docstring already argues this; what it was
missing is the note that **no database constraint stands behind it**, which is now written down
here rather than left for somebody to discover.

Revisit it when the import lands and rows start arriving from something other than the form.

---

## 6. The gate

Re-run whole, not incrementally, after every change above.

| | |
| --- | --- |
| `pnpm typecheck` | clean, all 11 packages |
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm test`, `DATABASE_URL` set, database created empty and migrated 0000 → 0016 | **2584 passed, 0 failed** |
| `pnpm test`, no `DATABASE_URL` | 2437 passed, 147 skipped |
| `pnpm -F @brandfactory/web build` | clean |
| `pnpm -F @brandfactory/web-next lint && typecheck && build` | clean |

**The backfill was re-verified independently of Phase F's run**, on a database built for it: 0000
through 0015 applied, four influencer rows written by hand — two creators sharing a name, one with
a `null` engagement rate, and one carrying the *same* `(instagram, priyaskin)` pair in a **second
workspace** — then 0016. Four rows in, four accounts out, all at position 0, the `null` rate
preserved as `null`, and the cross-workspace pair intact under the new unique key. The statement
order in the file is what makes that work: the `INSERT` runs before the four `DROP COLUMN`s.

**Three live tests fail on the shared dev database and are not this change.** `seed.test.ts` counts
seven brands and `queries.live.test.ts` asserts a count against them; that database carries five
brands created by hand in earlier sessions (`Acme Coffee`, `Northwind Studio`, `Casa Vostra` and
two spellings of `Ebb & Flow Group`). All 190 live tests pass on a database created empty. The
seed test's own hermetic guard, added in Phase B, is what makes this diagnosable rather than
confusing.

**Five schema edge cases were probed directly** rather than inferred, none of which the suite
covered, and all five behave:

- A handle is **trimmed before** the duplicate refinement sees it, so `priya` and `" priya "`
  collide rather than both landing in the table under one unique key.
- The duplicate refinement still runs when the array has **already failed `.max(10)`**, so an
  oversized body reports both faults instead of hiding one behind the other.
- `javascript:alert(1)` in an account's `url` is **refused** — `WebsiteUrlSchema`'s protocol filter,
  which is the reason Phase A reused it instead of the plan's `z.url().max(500)`. The value is
  rendered into an `href` on the detail page, so this is the difference between a link and a stored
  XSS.
- `totalReach` over ten accounts at the `integer` column's ceiling is `21,474,836,470` — inside
  `Number.MAX_SAFE_INTEGER` by five orders of magnitude, so the sum cannot lose precision.
- A **measured account with zero followers** contributes nothing to `blendedEngagement` rather than
  dividing by zero or dragging the blend, and the all-zero case still falls back to the plain mean.
