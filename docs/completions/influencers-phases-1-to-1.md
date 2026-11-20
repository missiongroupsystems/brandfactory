# The influencer roster on the core: completion

Plan: `docs/executing/influencers-plan.md` (it moves here once the code lands). Branch
`feat/influencers`, pack brandbase 1.19.0, migration `0029_influencers.sql` (additive, not applied
to production). Not merged, released or deployed: the owner picks a layout first.

## Phase 1: the roster, its import, its pictures and its pages

### Pack (1.19.0)

- `0029_influencers.sql`:
  - `influencers` (company, slug, name, category, status `active | prospect | past`, notes).
  - `influencer_accounts` (platform, handle in lower case without "@", followers, engagement,
    address, our own copy of the picture, when it was last read). One handle per platform per
    company.
  - `influencer_brands` (links for good to brands of the person's own company: both foreign keys
    carry the company). `source` is `saved` (the import) or `posted` (with the post that went out).
  - `post_handles(draft)` reads the Instagram handles a post's draft names: its collaborators and
    every photo's tags.
  - `account_profiles` (a saved collaborator's Instagram account no one on the roster holds: its
    name, picture and followers).
  - Walls: the rows of the companies the caller is an active member of (`reached_orgs()`), as for
    the company's brands.
  - `influencer_json()` builds one person as the moves answer them.
- Moves:
  - `influencer.list`, `influencer.read` and `influencer.edit` (name, category, status, notes).
    A person's brands are their links for good, plus every brand with a post that names them now.
    The second kind follows the posts: when no post of the brand names them any more, the link
    goes.
  - `post.publish_job` (a live job) and `post.mark` (marked posted) link each roster person the
    post names to the brand for good (`source` `posted`), so a later edit does not remove it.
  - `influencer.brand_link` and `influencer.brand_unlink`.
  - `influencer.import` (owners and admins; by slug and handle; mode `add` keeps what is stored,
    mode `update` writes what it is given).
  - `influencer.profile_list` and `influencer.profile_name` (any member; `fill` names only an
    unnamed account).
  - Internal, for the picture job: `influencer.picture_due` (roster accounts and saved handles,
    never read or not for 30 days), `influencer.picture_file`, `influencer.picture_set`,
    `influencer.profile_file` and `influencer.profile_set` (a name from Meta fills only an empty
    one).
- Rules: `influencer.found`, `influencer.account_found`, `influencer.brand_in_company` (409
  `BRAND_ELSEWHERE`), `influencer.org_reached` and `influencer.org_managed`.
- `tests/influencers.json`: 8 cases. They cover the list across companies, edits, links within
  the company only, the import (add, update, a handle held by another person, refusals), the
  picture records (a key the core did not issue is refused), and the saved handles' names.

### Import (`packs/brandbase/import/roster.ts`)

```
CORE_URL=… CORE_TOKEN=… pnpm -F @brandfactory/pack-brandbase import-roster --org <company> \
  --csv <dir> [--names <handle-names.csv>] [--workspace <uuid>] [--dry-run] [--yes-production]
```

- `<dir>` holds the old project's exports: `influencers.csv` (id, workspace_id, slug, name,
  vertical, status, notes, …), `influencer_accounts.csv` (influencer_id, position, platform,
  handle, followers, engagement_rate, url) and `brands.csv` (id, name).
  `influencer_brands.csv` is optional.
- Each person is written by slug and each account by platform and handle, so a second run adds
  nothing (checked locally: "0 people added, 146 already there").
- Old brand links map by brand name (Casa Vostra → `casa-vostra`), and a brand we do not have is
  skipped.
- Besides those, a person is linked to each brand whose saved collaborators hold their Instagram or
  TikTok handle. On the 0025 seed lists that gives casa-vostra 1, chin-mee-chin 1, temper 1 and
  petra 1.
- `--names` gives the saved handles their researched names. It takes high and medium confidence,
  Instagram only, one name per handle, and fills only an empty name. Locally it named 32 handles.
- It prints counts only. It refuses a core that is not on this machine without
  `--yes-production`. It was not run against production.
- The exports equal the archive seed field for field (146 people, 216 accounts), with notes for
  all 146. They stay out of git: the repository is public and the notes hold rates.

### Pictures (`packages/connect/src/brandbase/roster-pictures.ts`)

- `POST /roster/pictures?limit=N[&brand=id]` starts one run in the background, as the caller. It
  reads up to `limit` due accounts (default 50, at most 150). Each one is one Business Discovery
  call (`name,profile_picture_url,followers_count`) through the first brand the caller reaches
  whose Instagram is linked through our Meta app. The calls are 2 seconds apart, and the run stops
  at Meta's first rate limit.
- The picture is read only from Meta's hosts (redirects checked), at most 5 MB, JPEG, PNG or WebP.
  It is copied into the core's files, and its path is kept.
- An account Business Discovery does not find is marked read, so it is not asked again for 30
  days, and it keeps its initials.
- `GET /roster/pictures` answers the last run's counts. The log has one line per run, with counts
  only.
- The Production workflow's new task `roster-pictures` (input `limit`) signs in as the release
  person, starts the run and polls it until it ends.
- Profiles read elsewhere: `POST /roster/profiles?org=<company>` takes up to 150 profiles at a
  time ({handle, name, followers, picture}). For each one it copies the picture from Meta's hosts
  only, keeps the followers, and fills the name only where none is stored. A roster account is
  matched by its handle in the company; any other handle is a saved account.
- `pnpm -F @brandfactory/pack-brandbase import-profiles --org <company> --file <profiles.jsonl>`
  sends the `PROFILE` lines of a Business Discovery read to that route, 25 at a time, and prints
  counts only.
- Locally, it read all 164 profiles of the owner's read and copied 164 pictures. The read covered
  127 of the 139 roster Instagram handles and 37 of the 38 saved handles.
- Run it soon after the read: Meta's picture addresses expire within days.

### Web

- There is no roster page. The owner tried three layouts (`/creators` behind `?look=a|b|c`) and
  dropped the page on 20 Nov. The roster lives in the post page's people fields.
- Collaborators is now a field of chips with the same list as Tag people. Both list Instagram
  accounts in this order:
  1. The people linked to the brand, used lately first (the browser keeps the handles used per
     brand).
  2. The other linked people.
  3. Other accounts used lately.
  4. Everyone else: the brand's saved collaborators, then the rest of the roster.
- With the field empty, the list shows the brand's own people and saved handles, at most 8.
  Typing searches the whole roster by name or handle. A handle that matches nobody can still be
  added as typed.
- Each row has two lines and the same shape: the picture or initials, the name, then the
  Instagram logo and @handle. An unnamed handle shows the handle, with "Instagram" under it. A
  linked person's row ends with the brand's 14 px coin.
- On hover, a pencil on any row turns its first line into a field as wide as its content: Enter
  saves, Escape leaves the field. A roster person's name is saved as their own (it cannot be
  emptied). Any other handle's name is saved for the company (`account_profiles`). The name shows
  everywhere at once.
- A person becomes linked to a brand when a saved post of the brand names them as a collaborator
  or a tag, and for good once such a post goes out (see the pack). The web loads the roster again
  after each saved or removed post, so the coin shows at once. A handle typed that is nowhere yet
  is saved as the brand's collaborator.
- Replaced: `collaborator-picker.tsx` (the old menu, which also removed saved collaborators). No
  screen removes a saved collaborator now.
- `BrandMark` (the brand's coin) moved out of the brand switcher into `components/brand-mark.tsx`.

### Screenshots

Chromium at 1440 × 900, deviceScaleFactor 2, on a local core (Postgres 16) with the roster
imported from the owner's CSVs and its 164 pictures. The shots show the post page, on Temper:
the list with nothing typed and typed, the pencil on a roster person's row (hover, editing,
saved), and a person linked by a saved draft, then unlinked when the draft no longer names them.
The files are in the session's scratchpad (`roster-shots/final2/`) and are not committed.

### Gate

- Typecheck, lint, format and the web build pass.
- Tests: 1816 by count. 1535 pass and 280 are skipped without a Postgres server.
- One test fails: `posted-remote.test.tsx` ("the feed on the core"). It fails the same way on
  `origin/main` at c0dd4d4, and it is not in this change.
- The pack's tests also pass on Postgres 16 (`scripts/test-pg.sh src/packs.test.ts`).

### Left

- Release pack 1.19.0, then deploy the server.
- Run the import against production with the owner's exports and `--names`.
- Run `import-profiles` with a fresh `roster-profiles` read, or run the `roster-pictures` task.
- Editing a person's status, notes or accounts from the UI (the moves exist; no screen yet),
  unlinking a brand from the UI, and removing a saved collaborator.
