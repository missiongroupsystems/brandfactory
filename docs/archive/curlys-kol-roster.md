# The Curly's KOL roster replaces the invented one

One change, no phases. The seed's nineteen invented creators leave; the group's own Curly's KOL
media list arrives as 146 creators and 216 accounts, and is written into the production
`Mission Group` workspace by a new script.

No migration. 2592 tests (2437 + 8 new passing, 147 skipped without a database). `packages/web` is
untouched.

## The source

`docs/executing/MASTER LIST_KOL Media List_Curly's - KOLs (Cleaned Up) Targets.csv`.

The file has three sections. **Only the first imports.**

| Section | Rows | Imported |
| --- | --- | --- |
| `KOLs (Cleaned Up) Targets` | 152 | 146 |
| `CHEFS` | 24 | no — name and establishment, no account at all, which is a different noun than this table holds |
| `NOT APPROVED` | 9 | no — no follower count, and it is an exclusion list |

The CSV is left **untracked**. Ignoring it would protect nothing now that the seed carries its
content.

## What the shape cost

The record fits the list well in one place and badly in another.

**Well:** 62 creators post from two platforms and 4 from three. `influencer_accounts` — migration
0016, released the same day — is exactly the shape this list needs, and this is the first real
payload for it.

**Badly:** the CSV has six campaign columns (`PR Kit Seeding`, `RSVP for PR Kit`, `Invited for
6 Nov`, `RSVP for Event`, `Post Launch Hosting`, `Paid/Seeding Collab`), a rate card, a target and
an in-kind value. **None of that is a creator attribute** — it is per-campaign state, and the record
carries no money field at all. It is all folded into `notes` as free text, which is the only place
that exists today. A campaign aggregate would be its own release, and this document is where the
need is written down.

## The five refusals

12 rows carried no follower count. `InfluencerAccountsSchema` is `.min(1)` and
`InfluencerFollowersSchema` is not nullable, so a row with no account cannot exist. Writing `0` is
the exact defect 1.46.0's hardening pass fixed one level up: it renders as a Nano-band figure
somebody measured.

**Seven resolved** from public profiles on 2026-08-18. Each record's `notes` names the date and
states that nobody here measured it.

| Creator | Account | Followers | Note |
| --- | --- | --- | --- |
| Winnie Chan | `the_paperqueen` | 15,000 | the list records `thepaperqueen`; the account is `the_paperqueen` |
| Lelian Chew | `lelianchew` | 84,000 | |
| Sunny Han | `sunnyskitchen` | 51,000 | |
| Minju Jo | `minjujo` | 275,000 | |
| Jaime Lee | `jaim` | 25,000 | the list records the profile URL rather than a handle; it is the only `url` in the roster |
| Josh Niland | `mrniland` | 395,000 | the list records no handle |
| Kevin Wong | `kevinwongxx` | 12,000 | the list records no handle |

**Five did not import.** Four carry no handle, and the candidates a search returns are real
strangers who share a name. Grant Wee has one plausible account and nothing in the row to confirm
it — the row has no category, no subcategory and no remark to check against.

- Lorraine Koh
- Grant Wee
- Natassia Siu
- Marissa & Denise Lum
- Jaclyn Chan — handle `jacylnchan` is on record, no public follower count found

Attaching a real person's profile to somebody else's record, on a record that prices them, is worse
than a roster short by five. They are named here and in the changelog so the gap is fillable by
hand.

`Zita` was entered twice against `littleexpats_sg`.
`influencer_accounts_workspace_platform_handle_key` refuses two records holding one handle, so the
rows are merged, the larger of the two counts is kept, and the note records the merge.

## The one assumption

The media list carries **one** handle column and a follower column per platform. A creator's TikTok
account is therefore seeded under the handle their Instagram account uses.

That is what the source asserts by its own shape. The alternatives were to drop 77 accounts or to
invent handles for them. A handle that turns out to differ is a correction to one account, not to
the record.

## The mapping rules, stated so they can be redone

- **`status`** — `active` where `RSVP for PR Kit` is `Accepted` (51), `prospect` otherwise (95).
  Nobody is `past`; a creator who declined is still a name on a shortlist, and `past` means worked
  with and stopped.
- **`vertical`** — the category column decides, then the subcategory, then `food` as the default,
  because this is a food brand's list. Within one cell the content vertical beats the audience:
  `Pro / home chefs / Kids` is a chef, not a parenting creator. **The original text survives in
  `notes` on every row**, so the mapping is reversible.
- **`engagementRate`** — `null` on all 216 accounts. The list measures none.
- **`brandIds`** — empty on all 146. There is no Curly's brand in the workspace.
- **`url`** — `null` everywhere except Jaime Lee. Nothing derives a URL from a handle.

## `db:import-influencers`

`db:seed` was the wrong tool for a live database and this is why.

Production holds 6 real users, 4 workspaces, 4 real brands and — before this change — 0
influencers. The seed builds a demo world under fixed ids and **adopts nothing already present**:
pointed at this database it inserts its own `DEMO_WORKSPACE_ID`, so the real `Mission Group` gains a
second workspace of the same name, plus a demo user, seven brands, ten outlets, two projects and
nine invented vendors.

`packages/db/src/import-influencers.ts` writes `influencers` and `influencer_accounts` and nothing
else. It does not write `influencer_brands`, because every row's `brandIds` is empty and the
fixture's brand ids belong to the seed's demo brands.

- `--workspace <uuid>` is **required, with no default**. A default aimed at a real database is a
  guess.
- An unknown workspace is refused before any write, so the refusal names the problem instead of
  failing on row one of a partial transaction.
- **Idempotent** — fixed ids, `ON CONFLICT DO NOTHING` on `influencers.id` and on
  `(influencer_id, position)`. Verified by running it twice against production; the second run
  changed nothing.
- `--dry-run` executes every insert inside the transaction and rolls back, so a constraint the
  roster would violate raises during the rehearsal.

`tx.rollback()` throws `TransactionRollbackError`, which is how drizzle unwinds a transaction rather
than a failure — and it is matched on the **constructor**, because drizzle leaves `err.name` as the
base `DrizzleError` for all of its errors. The first draft matched on `err.name` and reported a
successful rehearsal as a broken import.

### Verified in production

```
workspace   Mission Group (ff0c3706-2b91-4ed8-8742-88ebb1788d80)
creators    146
accounts    216   (position 0: 146, position 1: 66, position 2: 4)
other workspaces  0 creators each
```

## Tests

**Eight new, in `packages/db/src/seed-influencers.test.ts`, and they need no database** — which is
the point of the file. `seed.test.ts` asserts what the seed writes and skips whenever
`DATABASE_URL` is absent, so a fixture generated out of a spreadsheet had nothing checking it until
the moment of a live insert.

The new file applies the shared schemas to seed data that never crosses the wire: the
`(platform, handle)` pairs, the slugs, the ids, the note lengths, the absent rates, the empty
brands. It also pins **Lennard Yeong** — 534k on Instagram plus 981.6k on TikTok is Mega at 1.52M,
and neither account alone clears the Macro floor of 500k. That is this release's argument reduced to
one assertion.

`seed.test.ts` moves from 19 / 19 / 17 to 146 / 216 / 0 and counts accounts **by position** rather
than in total, which catches a list written in the wrong order as well as a wrong conflict target.

## Two things left open

1. **`influencerSlug` cannot name a creator who is only on XiaoHongShu.** It strips everything
   outside `a-z0-9`, so a name with no latin characters becomes the `creator` fallback, and both
   XHS-only creators here would have landed on `/influencers/creator` and `/creator-2`. Their slugs
   are written out as `luo-daxiong` and `wang-kaihua` — which the seed may do, since it hard-codes
   every slug. **The rule is still wrong.** `InfluencerSchema` states XiaoHongShu "is not optional
   here"; the slug rule disagrees. A fix needs transliteration and a decision about slugs already
   written.
2. **The repository is public and these are real people.** `notes` holds negotiated fees, who
   declined and why — including two who declined for reasons of health — and judgements about a
   person's audience and wealth. Nothing is redacted, because the import was asked for whole. The
   fixture docstring and the seed's file header both say so at the top. Making the repository
   private changes nothing else.
