# A creator is a person, not an account — 1.46.0

Release-level outline. Six phases plus a hardening pass, one aggregate. The phase notes are
siblings of this file; this is the map to them. They move to [`../archive/`](../archive/) when the
next feature lands.

**Migration 0016.** 2584 passed | 0 failed with `DATABASE_URL`; 2437 passed | 147 skipped without
one. `packages/web` untouched throughout.

---

## The problem

- `Add a creator` asked for **a** handle, **a** platform and **a** follower count, and the form's
  own hint said why that was wrong: *"One row per platform — two accounts are two follower
  counts."*
- **A person was two rows.** A creator with an Instagram grid and a TikTok account appeared twice
  in the roster, each row carrying half the story, with nothing linking them — not a foreign key,
  not a name match. Filtering by `Beauty` returned the same person twice.
- **The URL admitted it.** `InfluencerSlugSchema` recorded the cost: `priyaskin` and `priyaskin-2`,
  and the URL did not say which was which.
- **The reach tiers were wrong, not just incomplete.** 60k + 50k + 30k is a mid-tier creator filed
  into Micro three times — so the one figure the whole screen sorts, groups and prices by was
  understated for exactly the creators worth the most.

This was never a Singapore edge case: XiaoHongShu is in the platform enum *because* this group's
creators are on it, and a creator on XHS is on Instagram as well essentially always.

## What shipped

| | |
| --- | --- |
| **Table** | `influencer_accounts` — migration 0016, with a hand-written backfill |
| **Wire** | `accounts: [{platform, handle, followers, engagementRate, url}]`, 1–10, ordered |
| **Derived** | `totalReach`, `blendedEngagement`, `primaryAccount`, `platformsOf` in `@brandfactory/shared` |
| **Routes** | unchanged in shape; the 409 now names the creator who holds the handle |
| **Screens** | Platforms column, reach as a sum, an Accounts card, a repeatable account row in the form |
| **Seed** | nineteen creators, one account each — the mechanical move, nothing invented |

## The phases

| Phase | Note | Ships | Tests |
| --- | --- | --- | --- |
| A | [The record](./influencer-accounts-phase-a-the-record.md) | nothing visible — the contract, and every consumer stops compiling | +27 |
| B | [The table](./influencer-accounts-phase-b-the-table.md) | the child table, migration 0016, the queries, the seed | +9 |
| C | [The routes](./influencer-accounts-phase-c-the-routes.md) | the API speaks the new shape; the 409 names a person | +6 |
| D | [The read surfaces](./influencer-accounts-phase-d-the-read-surfaces.md) | the roster and the page read it | +4 |
| E | [The form](./influencer-accounts-phase-e-the-form.md) | the screen can enter it | +19 |
| F | [Verify and release](./influencer-accounts-phase-f-the-release.md) | the gate, the browser pass, two fixes | +2 |
| — | [Hardening](./influencer-accounts-hardening.md) | the pre-push review: a laundered `0`, a 409 that could name the wrong account, a lost staleness clause | +1 |

Plan: [`influencer-accounts-plan.md`](./influencer-accounts-plan.md).

## The decisions that carried the release

**An account is a value object.** No surrogate id, no timestamps, `(influencer_id, position)` as
the key, and a write that replaces the whole list — `vendor_contacts` exactly. The day an import
refreshes one account's follower count without a person editing the record, an account needs its
own `metrics_updated_at` and this trade has to be re-made; it is written down in the schema so it
is visible when it arrives.

**Position 0 is the primary account, and there is no flag.** On a vendor contact, *where a row sits
in the list* and *who answers the phone* are two different facts and the boolean is earned. Here
they are one fact. Deriving the primary from the largest follower count instead would let a
refreshed number silently change the line that identifies the person.

**`workspace_id` is denormalised onto the child**, because the one refusal only the database can
make — one account per `(platform, handle)` per workspace — names columns that now live there, and
a unique index needs every column on one row. Exactly one function writes it.

**The reach figures are derived on read and never stored**, in `shared` rather than in the frontend
because the server sorts by reach too. A `totalFollowers` on the wire would be a number that can
disagree with the array printed beside it.

**The slug moved from the handle to the name**, and **no existing slug moved with it**. They are
frozen at create and the migration touches no `slug` value, so a link shared before this release
still resolves — at the cost of older records reading `/influencers/priyaskin` under a rule that no
longer produces that.

**Duplicates are refused three times over, deliberately.** The form flags a repeated
`(platform, handle)` on the row before submit; zod refuses the body with the row's own path; the
unique index refuses the write. The first two exist so the third is never the thing a person reads.

**Nothing derives a URL from a handle.** A wrong link to a real stranger's profile is worse than no
link, and XiaoHongShu — which addresses users by an opaque numeric id — is why the nullable `url`
column exists at all.

## What was deliberately not done

- **No merge action.** The migration gives every existing row its own creator, so a person entered
  twice today stays two creators. Two rows sharing a name are two people as often as one, and
  nothing can safely tell.
- **No per-account history, no import, no rate card.** `Import or sync creators` is still the
  stated placeholder it was; what changed is that the import is now possible to write honestly.
- **The seed was adapted, not rewritten.** Nineteen invented creators, one account each, every
  figure they had. The curated multi-account roster this table now makes possible is not seeded,
  because these are invented people and a richer fixture would be a more elaborate fiction.

## Two things found in the browser pass

Neither was visible to `lint`, `typecheck` or a test — the first rendered a valid string and the
second a valid anchor:

- an unmeasured engagement rate rendered `…`, this app's mark for **a request in flight**, where it
  meant **not recorded**;
- a handle carrying a `url` looked exactly like the two beside it that did not, because its only
  affordance was a hover underline.

## Four things the pre-push review changed

The [hardening note](./influencer-accounts-hardening.md) has the reasoning; the short form:

- **`toAccountPayload` laundered an empty follower box into `0`** — `Number("")` is `0`, and the
  docstring claimed `NaN`. A creator entered on zero followers is not a blank cell: it is a Nano
  band member that reads as a measurement somebody took. The emptiness is tested before the
  conversion now, and the schema refuses the `NaN`.
- **The 409 could name an account that was never in conflict.** `InfluencerHandleTakenError` held
  three independent fields where one best-effort read produces all three, so both call sites filled
  the gap with `accounts[0]` — correct only for a creator with one account, on the aggregate about
  creators with more. It is one nullable object now, and a message that names no pair rather than
  the wrong one.
- **The form's `Last updated` clause came back**, on the section rather than on a row: an account
  carries no timestamp of its own, deliberately, and the parent's `updatedAt` is the honest
  granularity.
- **Two comments had gone false** — a `vendors.ts` cross-reference to an index migration 0016
  dropped, and Phase F's own note about where these documents live.

One finding was examined and **left alone with the reasoning kept**: nothing in the database
enforces that a creator has at least one account, and `primaryAccount` throws during render. A
`CHECK` cannot see another table's absent rows and a deferred constraint trigger is machinery this
schema has never used; every write path holds the invariant, and a loud failure beats rendering a
creator with no handle as though the record could hold one.

## One finding left for its own change

`DELETE /workspaces/:id/influencers/<slug>` answers **500** where the same route with an id answers
200: the branded id schemas are `z.string().min(1)`, so a slug passes validation and reaches
Postgres as a non-uuid. **Not this aggregate** — outlets and vendors do the same on untouched code,
and no screen sends a slug there.
