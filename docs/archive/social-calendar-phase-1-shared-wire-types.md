# Social calendar, Phase 1 — the shared wire types

**Status:** shipped, 2026-08-03. Executes Phase 1 of
[`docs/executing/social-calendar-implementation.md`](../executing/social-calendar-implementation.md)
(proposal §2 of [`docs/executing/social-calendar.md`](../executing/social-calendar.md)).

**No migration, no route, no UI, and nothing imports it yet** — the contract
layer only, exactly as scoped: one branded id, three schemas, one sort helper,
all in `packages/shared`. No other package touched.

Test baseline: shared suite **54 → 78 (+24)**. The full tree ran
**1092 passed | 49 skipped** at verification time — that number is entangled
with the parallel guideline-autofill stream working the same checkout (its
Phase A completion measured 1068 with this stream stashed; 1068 + 24 = 1092,
so the two streams' additions account for each other exactly).

---

## What landed, file by file

### `src/ids.ts` — `SocialPostIdSchema` (1.1)

`brandedId('SocialPostId')` + the exported type, slotted between
`ResearchJobIdSchema` and `UserIdSchema`. Nothing to decide; the helper's
comment already says why ids are nominal.

### `src/social/post.ts` — the row schema and the ordering (1.2, 1.3)

New directory, mirroring `src/asset/`'s layout (row / create / update as
sibling files).

- `SocialPlatformSchema` — the eight members from proposal §1
  (`instagram | facebook | tiktok | linkedin | x | youtube | pinterest |
  other`), and `SocialPostStatusSchema` (`draft | ready | posted`). Member
  lists will be duplicated with the pgEnums in Phase 2, per the existing
  zod-⇄-pgEnum convention. The status schema's doc comment carries the
  decision that matters: all three states are **manual** — nothing publishes,
  nothing auto-flips when the scheduled time passes.
- `SocialPostSchema` — exactly the proposal §2 shape: nullable `scheduledAt`
  (`null` = the unscheduled tray, a first-class state), `body` max 5000 with
  `''` meaning "slot claimed, copy pending", `assetIds` max 20 **ordered**,
  ISO timestamps throughout.
- `bySchedule(a, b)` — the pure sort helper, named after the `byPosition`
  precedent. It mirrors the SQL ordering Phase 2's `listSocialPostsByBrand`
  will use (`scheduled_at asc nulls first, created_at asc`): unscheduled
  group first, scheduled chronologically, `createdAt` breaking ties in both
  groups. String `localeCompare` is valid because the mappers normalise every
  timestamp to ISO UTC, where lexicographic order is chronological. The
  Phase 4 cache applier re-sorts with this after every write — unlike an
  asset, a patched post *moves* in the ordering.

**One deviation from the letter of the plan:** the body max and the assetIds
array are exported as `SocialPostBodySchema` / `SocialPostAssetIdsSchema` and
imported by both input schemas, rather than duplicating the literals
per-file the way `asset/` duplicates `z.string().min(1).max(200)`. Three
files stating "max 5000" independently is three places for the max to drift;
the asset module predates anyone noticing. The wire shapes are identical.

### `src/social/create.ts` — `CreateSocialPostInputSchema` (1.4)

The row minus everything the server owns (`id`, `brandId` — it is in the
path — `deletedAt`, timestamps). Only `platform` is required; the server
defaults `scheduledAt: null`, `body: ''`, `status: 'draft'`, `assetIds: []`,
and the schema comment documents that contract for Phase 3.

**Small widening, deliberate:** `scheduledAt` is `.nullable().optional()`
where the plan said only optional — an explicit `null` and an omitted key are
the same statement ("create unscheduled"), so a client that spells its intent
is not rejected for it, and the server reconciles one meaning instead of two
shapes. Omitted keys stay omitted after parse (no zod defaults), so the route
still sees client intent vs. absence unambiguously.

### `src/social/update.ts` — `UpdateSocialPostInputSchema` (1.5)

Every key optional; `.refine` rejects the bare `{}` (the
`UpdateBrandAssetInputSchema` rule, same message shape). `scheduledAt` is the
one nullable patch key (`null` = move to the tray); `assetIds` is a full
replacement, order = array order — add/remove/reorder are one verb, which is
what keeps Phase 2's join table an implementation detail. `deletedAt` is
absent by design: zod strips the unknown key, which empties the patch, which
fails the refine — so a patch trying to delete is rejected rather than
silently half-honoured (this is pinned by a test).

### `src/index.ts` — the re-export block (1.6)

`// Social posts` block (post / create / update) after `// Brand research`,
matching the existing section style.

### Tests — `post.test.ts`, `create.test.ts`, `update.test.ts` (1.7)

Three sibling files mirroring `asset.test.ts`'s conventions (a `post()`
builder with a `Partial` override, cast fixtures, comments only where the
assertion encodes a rule). **12 + 5 + 7 = 24 tests:**

- Enum membership pinned exactly (both enums, via `.options`) — Phase 2's
  pgEnums will be asserted against the same lists.
- Row schema: scheduled-with-attachments parse, null `scheduledAt`
  round-trip, empty body accepted, 5000/5001 body boundary, 20/21 assetIds
  boundary, unknown platform rejected, date-only (non-ISO-datetime)
  `scheduledAt` rejected.
- `bySchedule`: tray first, chronological scheduled order, `createdAt`
  tie-break inside both the slot and the tray.
- Create: platform-alone parses to exactly `{ platform }` (defaults stay the
  server's), body-without-platform rejected, explicit `null` scheduledAt,
  full shape, shared maxes.
- Update: `{}` rejected, single-key patches accepted, `scheduledAt: null`
  unschedules, `assetIds: []` clears, `deletedAt` not a patch key, `null`
  rejected on every non-nullable key, shared maxes.

## Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint / format:check          clean
pnpm -F @brandfactory/shared test 5 files, 78 passed
pnpm test                         1092 passed | 49 skipped (full tree, both streams)
pnpm -F @brandfactory/web build   clean
```

One prettier pass was needed on `post.test.ts` (line-wrap style); committed
formatted.

## Notes for the next phases

- **The Phase 2 migration gate stands.** `packages/db/drizzle/` still tops
  out at 0007 at the time of writing; the parallel guideline-autofill stream
  has shipped its Phase A (port + adapter, no migration) but has **not**
  landed the `section_autofill_events` migration that claims 0008. Do not
  generate blind — re-check the directory and settle 0008 vs 0009 with the
  user first, per the plan.
- **Shared-checkout hazard, observed directly:** the autofill stream stashes
  this stream's files to measure its test baselines. Mid-phase, this
  stream's uncommitted files transiently vanished from the tree during such
  a cycle (they were restored intact minutes later). A backup of this
  phase's six files plus restore instructions sits in the session scratchpad
  (`phase1-social-shared/`); committing per phase, as the plan prescribes,
  is the real protection.
- Phase 2's mapper asserts rows against `SocialPostSchema` — the ISO-UTC
  normalisation that makes `bySchedule`'s string comparison valid is
  enforced there, not here.
