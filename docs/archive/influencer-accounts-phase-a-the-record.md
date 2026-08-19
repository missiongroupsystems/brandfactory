# Influencer accounts Phase A — the record

**Nothing on screen changed. The contract did, and everything downstream now fails to compile.**

Phase A of [`./influencer-accounts-plan.md`](./influencer-accounts-plan.md).
`/influencers` still renders nineteen rows out of the columns the server still has; not one file in
`packages/web-next`, `packages/server` or `packages/db` was opened. What landed is the shape a
creator has from here on: an account is a child record, and the four fields that described one have
left the person.

Base: `main` at **0140ded** (1.45.0 plus the seed-fixtures switch). `@brandfactory/shared`:
**287 passed**, of which 54 are this aggregate's — 38 in `influencer.test.ts` (was 27) and 16 in the
new `reach.test.ts`. **+27 tests.**

8 files: 6 modified, 2 new. Migration: none in this phase — the table is Phase B.

**`pnpm typecheck` now fails in `db`, `server` and `web-next`, and that is the contract working.**
`hc<AppType>` makes a route-shape change a compile error at every call site, which is the property
this repo buys the shared package for. B and C close it.

---

## 1. What moved, in one picture

```
before                              after
influencers                         influencers                influencer_accounts (Phase B)
  name                                name                       platform
  platform    ─────────────────┐      vertical                   handle
  handle      ─────────────────┼──▶   status                     followers
  followers   ─────────────────┤      notes                      engagementRate
  engagementRate ──────────────┘      brandIds                   url          ← new
  vertical                            accounts: [ … ] ───────────────────────────┘
  status
  notes
  brandIds
```

Everything that describes the **person** stayed. Everything that describes an **account** went
down. Nothing was invented on the way except `url`, which decision 7 of the plan argues for and §5
below records the shape of.

The wire:

```jsonc
{
  "id": "…", "slug": "priya-raman", "name": "Priya Raman",
  "vertical": "beauty", "status": "active", "brandIds": ["…"], "notes": null,
  "accounts": [
    { "platform": "instagram",   "handle": "priyaskin", "followers": 840000, "engagementRate": 1.1,  "url": null },
    { "platform": "tiktok",      "handle": "priyaskin", "followers": 312000, "engagementRate": 4.2,  "url": null },
    { "platform": "xiaohongshu", "handle": "普莉娅",     "followers": 88000,  "engagementRate": null, "url": "https://…" }
  ]
}
```

---

## 2. `InfluencerAccountSchema` — a value object, and the four field schemas are untouched

`platform`, `handle`, `followers` and `engagementRate` reuse `InfluencerPlatformSchema`,
`InfluencerHandleSchema`, `InfluencerFollowersSchema` and `InfluencerEngagementRateSchema`
**unchanged**. Not one rule in them was edited, because every rule they carry was always an
account's rule: the `@` refusal is about a handle, the non-negative integer is about a follower
count, the 100 cap is about a percentage of an audience. They were declared on the wrong noun,
which is a different defect from being wrong.

No surrogate id and no timestamps — `vendor_contacts` exactly, and for the reason that table's
docstring already gives: a full-replacement write makes a `createdAt` reset on every unrelated edit
of the parent, and it then reads as a lie about when the account started. `(influencer_id,
position)` is the key, the wire is a plain ordered array, and a write replaces the whole list.

The docstring records the day this has to change: when an import refreshes one account's follower
count without a person editing the record, an account needs its own `metrics_updated_at`, and a
full-replacement write from the form would race it. That is a future release, written down now so
the trade is visible when it arrives rather than rediscovered.

---

## 3. `InfluencerAccountsSchema` — `min(1)`, `max(10)`, and a refusal with a path

`.min(1)` is the status quo rather than a new demand: `handle`, `platform` and `followers` are all
required on the form today. It is also what keeps the reach-tier grouping **total** — a creator
with no account would have no reach, would fall out of every band, and the band counts would stop
summing to the rows, which is the one thing `tiers.ts` says a total grouping may not do.

`MAX_INFLUENCER_ACCOUNTS = 10` is exported rather than inlined, because Phase E's `Add account`
button has to disable on the same number the schema refuses on. Ten is two more than there are
platforms in the enum. Twenty was right for `VendorContactsSchema` because a big agency really has
a dozen named people; nobody posts from ten accounts.

**The duplicate refusal is a `superRefine`, not a `refine`, and the difference is the path.**

```ts
ctx.addIssue({
  code: 'custom',
  path: [index, 'handle'],
  message: `@${account.handle} on ${account.platform} is already listed above — …`,
})
```

A `refine` on the array can only fail the array, which puts the message above a list of ten rows
and leaves the person to find the repeat. The issue is raised on the **second** occurrence, at
`accounts.1.handle`, which is the field somebody has to change and the key Phase E's `fieldErrors`
already reads. `asset.ts`'s `checkKindSourceAgreement` is the precedent for the form.

Two decisions inside the check:

- **The comparison is exact, not case-folded.** The constraint behind it —
  `influencer_accounts_workspace_platform_handle_key` — compares exactly, so folding here would
  refuse a pair the database would accept. A schema stricter than its constraint is its own defect.
- **Duplicates are rejected, not deduplicated**, the call `InfluencerBrandIdsSchema` already makes.
  A repeated pair reaching the write would take the unique violation inside the transaction and
  surface as a 409 about a conflict with *another creator* — the wrong sentence for a malformed
  body.

Two accounts on the **same platform** with different handles are accepted on purpose, and a test
pins it: three Instagram accounts is a real creator, and it is what the unique key always permitted.

---

## 4. `reach.ts` — the derivation, in `shared` because the server needs it too

Four functions and the comparator, in a new file:

| | |
| --- | --- |
| `totalReach(accounts)` | the plain sum |
| `blendedEngagement(accounts)` | follower-weighted mean over measured accounts, `null` when none |
| `primaryAccount(accounts)` | `accounts[0]` |
| `platformsOf(accounts)` | distinct platforms, in enum order |
| `byInfluencerReach(a, b)` | reach desc, name asc, id asc — **moved here** |

**Derived on read, never stored, never a field on the wire.** A `totalFollowers` on the record
would be a number that can disagree with the array printed beside it after a partial write. The
tier was already derived from a figure the row carried; this is the same call one level down.

**In `shared` rather than in `web-next` because the server sorts by reach**, and reach is now a sum
no `ORDER BY` reaches without a join and a `GROUP BY`. One definition, one test file, both sides of
the wire.

### The three judgement calls inside it

**`totalReach` double-counts, and says so.** A person following the same creator on Instagram and
TikTok is counted twice. Every rate card in the trade adds the platforms up the same way, and the
detail page prints the per-account split directly above the total, so the sum is never the only
figure on the screen.

**`blendedEngagement` weights and drops nulls out of both halves.** An 88k account at 6.0% and an
840k account at 1.1% average to 3.55% and describe nobody; weighted, they answer **1.56%**, which
is what a campaign across both would see. An account with `null` leaves the numerator *and* the
weight — counting it as a zero would turn "nobody has measured it" into "it is bad", which is the
distinction `format.ts` says this aggregate has already defended three times.

Two guards the plan asked for and one it did not:

- Zero weight — a creator whose only measured account has 0 followers — falls back to the plain
  mean of the measured rates. It is also what makes a single account return its own rate unchanged,
  which is parity with the column this replaced.
- The result is **rounded to two decimals**. The inputs come out of `numeric(5,2)`, so the blend
  cannot honestly claim more precision than the figures it is made of, and the rounding keeps
  binary-float noise (`2.3000000000000003`) out of a number the screen prints and a test compares.

**`primaryAccount` throws on an empty array instead of answering `undefined`.** This is the one
place the type system could not carry the invariant, and it was measured rather than assumed: under
`noUncheckedIndexedAccess`, zod 4's `.nonempty()` no longer narrows an array to `[T, ...T[]]`, so
`accounts[0]` is `T | undefined` whatever the schema says. The alternatives were a nullable return
that a dozen call sites each invent a different fallback for, or a `z.tuple([A], A)` schema that
buys the type at the cost of `.max(10)` and the min/max messages the form renders. The throw is
unreachable for any record parsed by `InfluencerSchema`, and the docstring says so.

`platformsOf` answers **enum order, not entry order**, so a creator who reorders their accounts
does not get a different-looking Platforms cell for a change that says nothing about which
platforms they are on.

### Why the comparator moved files

`byInfluencerReach` reads `totalReach`, and `reach.ts` imports the account type from
`influencer.ts` — the import back would be a cycle. It moved rather than the functions moving up,
because `influencer.ts` is the record and this file is the arithmetic over it. **No consumer's
import changed**: both are re-exported from `shared/src/index.ts`, and nothing in the repo imports
the deep path. A comment sits where the function used to be, so a reader who knew it there is not
sent looking.

Its docstring lost the line about mirroring `listInfluencersByWorkspace`'s SQL. It no longer mirrors
an `ORDER BY` — it **replaces** one, and Phase B drops `influencers_workspace_followers_idx` with
the column it indexed.

---

## 5. `url` — reused rather than declared

The plan's A1 says `InfluencerUrlSchema` — `z.url().max(500)`. **The field is `WebsiteUrlSchema`
instead, and this is the phase's one deliberate deviation.**

The value is rendered into an `href` in Phase D. `shared/src/url.ts` exists precisely because a
bare `z.url()` accepts `javascript:alert(1)` — measured against zod, not assumed — and its
docstring states the rule: a value that reaches an `href` is filtered where it is declared rather
than at each surface that renders it. `VendorSchema.website` is the precedent, one line long.
Declaring a second URL schema here would have re-argued the protocol filter at a second call site,
which is the failure the extraction in 1.43.0 existed to prevent. The cap moves from a proposed 500
to the shared 2048; a column of `text` takes either.

What the field is *for* is unchanged from the plan: a handle resolves to a profile URL by guessing
on five of the six platforms and **not on xiaohongshu**, which addresses users by an opaque numeric
id. Nothing derives a URL from a handle anywhere — a wrong link to a real stranger's profile is
worse than no link — so the screens render plain text when it is `null`.

Like every nullable field on `VendorContactSchema`, `url` is `.nullable()` and **not**
`.optional()`: one schema serves the row and both inputs, so a client sends an explicit `null`
rather than omitting the key. That is the existing convention, not a new demand.

---

## 6. The slug now comes from the name

`influencerSlug(name)`, `uniqueInfluencerSlug(name, taken)` — parameter renamed, **body
unchanged**, `INFLUENCER_SLUG_FALLBACK = 'creator'` kept.

This is the resolution of a cost `InfluencerSlugSchema` used to record instead of fixing: the
handle was the source while the record *was* an account, and a person carrying up to ten handles
has no non-arbitrary one to name a URL after. `/influencers/priya-raman`.

**No slug already in the table moves.** They are frozen at create and Phase B's migration touches no
`slug` value, so every link shared under the old rule still resolves. The seed's slugs stay as they
are and its docstring is corrected in B5 to say they are historical.

`uniqueInfluencerSlug`'s `-2` suffix survives with a smaller job: it now catches two people who
genuinely share a name, rather than one person entered twice.

---

## 7. The docstrings that were rewritten, and why that is not tidying

Four blocks now describe the opposite decision from the one they used to. A stale docstring is
worse than none, because a reader trusts it exactly as much as the code:

1. **`InfluencerPlatformSchema`** said "the row carries **one** platform … and that is a deliberate
   simplification of a real many-to-many". It now names the three costs that simplification was
   paying and points at `InfluencerAccountSchema`.
2. **`InfluencerSlugSchema`** carried a "Known cost" paragraph about `priyaskin` and `priyaskin-2`.
   That cost is gone; the block now says why the name is the source and that existing slugs did not
   move.
3. **`InfluencerFollowersSchema`** explained why the tier grouping was total *because the row
   carried the number*. The grouping is still total, for a new reason — the sum over a `min(1)`
   array — and the block says so.
4. **`UpdateInfluencerInputSchema`** argued that `handle` and `platform` are patchable while the
   slug does not follow. Neither key exists any more; the same argument now runs on `name`.

---

## 8. The tests

`influencer.test.ts`: 27 → 38. `reach.test.ts`: 16, new.

The pgEnum ⇄ zod pin is untouched — all three enums keep their member-list assertions, which is the
only place in the repo that reads both sides as data.

What the new cases assert, beyond the moved ones:

- The account schema carries **exactly** the five keys, and the create input carries **exactly**
  six with no `handle`, `platform`, `followers` or `engagementRate` among them. A client still
  sending the old four is talking to the old contract and should not be half-understood.
- `javascript:` is refused in the `url` field and `https:` is accepted — §5's whole argument, pinned.
- `min(1)`, the tenth account accepted, the eleventh refused, and `MAX_INFLUENCER_ACCOUNTS === 10`.
- The duplicate pair is refused **at `[1, 'handle']`** with the pair named — the path is asserted,
  not just the failure, because the path is what Phase E's form needs.
- Two accounts on one platform: accepted. One handle on two platforms: accepted — the case that
  started this change.
- `blendedEngagement` weights (1.1% over 840k with 6.0% over 88k → **1.56%**), ignores a `null`
  rate entirely rather than counting it as zero, answers `null` when nothing is measured, returns a
  single account's own rate unchanged, and survives a zero-follower denominator.
- `byInfluencerReach` puts a three-account creator (60k + 50k + 30k) **above** a one-account creator
  on 100k — the defect this whole change exists to fix, stated as an ordering assertion.
- An empty patch is still refused, and `{ accounts: [] }` is refused rather than emptying the list:
  the patch that removes every account is a delete of the creator.

---

## 9. Gate

| | |
| --- | --- |
| `pnpm vitest run --project @brandfactory/shared` | **287 passed** (17 files) |
| `pnpm exec eslint packages/shared/src/influencer` | clean |
| `pnpm exec prettier --write` on the eight files | clean |
| `tsc --noEmit -p packages/shared/tsconfig.json` | clean |
| `pnpm typecheck` (repo) | **fails in `db`, `server`, `web-next` — expected, see the header** |

No browser pass: nothing on a screen changed, and nothing on a screen *can* change until Phase D.

Next: **Phase B** — `influencer_accounts`, migration 0016 with the hand-written backfill, the
mappers, the queries and the seed's mechanical move.
