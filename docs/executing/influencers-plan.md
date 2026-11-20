# The influencer roster on the core: plan

Goal: bring back the old BrandFactory influencer roster (the "Curly's KOL media list", 146 people
and 216 accounts) into Brand Base by Tue 24 Nov 2026, and make the post page's Collaborators and
Tag people suggest the brand's people from it. Branch `feat/influencers`, pack brandbase 1.19.0,
migration `0029_influencers.sql`. The completion document is
`docs/completions/influencers-phases-1-to-1.md`.

Sources: the archive branch `archive/main-2026-10-07` (`packages/db` migrations 0014 and 0016,
`SEED_INFLUENCERS` in `packages/db/src/seed.ts`, the old `/influencers` pages), the old Supabase
project's own CSV exports of `influencers`, `influencer_accounts` and `brands` (the owner's;
`influencer_brands` was empty), and the researched names of the brands' saved collaborators
(`handle-names.csv`).

## Decisions

1. **Company-wide, under the same walls as the company's brands.** A person belongs to one company
   (`org_id`); every active member of it reads and edits the roster. Brand links name brands of
   the person's own company (both foreign keys carry the company).
2. **The CSV exports are the source, not git.** The notes hold negotiated rates and remarks about
   named people, and the repository is public. The import reads the exports from a folder the owner
   gives; nothing of the roster is committed. The exports match the archive seed field for field
   (146 people, 216 accounts, 0 differences), with the notes.
3. **No invented brand links.** A person is linked to a brand only where the brand's saved
   collaborators (`brands.collaborators`, migration 0025) hold their Instagram or TikTok handle;
   the team links the rest on the Creators page.
4. **One source of names for the saved handles no one on the roster holds:** `account_profiles`
   (company and handle). The import fills it from `handle-names.csv` (high and medium confidence),
   the picture job fills an empty name from Business Discovery, and a person names or renames one
   by hand in the post page's list or on the Creators page.
5. **Pictures are copied, never linked.** Meta's `profile_picture_url` expires. A server job reads
   Business Discovery through a brand's Instagram account linked by our own Meta app and copies
   each picture into the core's files; initials show until then, and for anyone Business
   Discovery does not find.
6. **Three layouts behind `?look=a|b|c`** (list, grid of cards, compact table) on the same data;
   the owner picks one and the others go.

## Phase 1 (one phase)

1. Pack 1.19.0: `0029_influencers.sql` (`influencers`, `influencer_accounts`, `influencer_brands`,
   `account_profiles`, `influencer_json()`), moves `influencer.list`, `.read`, `.edit`,
   `.brand_link`, `.brand_unlink`, `.import`, `.profile_list`, `.profile_name`, and the internal
   `.picture_due`, `.picture_file`, `.picture_set`, `.profile_file`, `.profile_set`; rules; tests.
2. `packs/brandbase/import/roster.ts`: the CSV import through the moves, idempotent by slug and
   handle; `--names` for the researched names.
3. `packages/connect/src/brandbase/roster-pictures.ts`: `POST /roster/pictures` (a run in the
   background, rate limited, counts only in the log) and `GET /roster/pictures`; the Production
   workflow's `roster-pictures` task.
4. Web: `/creators` (nav "Creators"), the side panel, the pickers' new ranking and the inline name.
5. Gate, changelog, screenshots on a local core with the imported roster.

## Not in this plan

Adding or removing a person or an account from the UI, TikTok and Facebook names in the pickers
(Instagram's alone take a collaborator or a tag), and a phone tab for Creators.
