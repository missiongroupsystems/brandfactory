# The brands' real posts: as built

Plan: `real-brand-posts-plan.md`. Branch `feat/real-brand-posts`, from `main` at `cc31d7d`.

## Phase 1: brandbase 1.6.0 and the import

### What changed

- `packs/brandbase/migrations/0014_imported_posts.sql`: `posts.permalink`, `posts.metrics`,
  `posts.measured_at`, all nullable; `post_json` adds `measuredAt`. No wall changes.
- `post.import` (`ops/post.import.json`) with three new rules, `post.import_id_fits`,
  `post.import_by_a_person` and `post.import_past`, as in the plan. Manifest 1.6.0; `ontology.json` describes the three columns.
- `packs/brandbase/import/`: `apify.ts` (the mapping), `apify.test.ts`, `accounts.json` (the
  handles), `run.ts` (`scrape` and `load`), run as
  `pnpm -F @brandfactory/pack-brandbase import-posts …`. (`import` is a pnpm command, so the
  script is `import-posts`.) `load` refuses a core that is not on this machine without
  `--yes-production`. `scrape` makes its output folder before any run, refuses a `--limit` that is
  not a whole number, and prints each run's id as it starts. `load` gives each cover a new media id
  on each try, so a load that stopped after an upload never asks storage for a key it holds.
- web-next: the post page no longer throws for a brand outside the demo's static data. The
  composer, the idea page and the suggestion lists read `CAPTION_DRAFTS`, `HASHTAGS`,
  `INSIGHTS_BY_BRAND`, `ACCOUNTS`, `PLACES`, `LABELS`, `USED_HASHTAGS` and `VENUE` by brand id;
  for such a brand they now give nothing (no drafts, no suggestions, a flat best-time chart,
  no best hour or best time, an empty Drive, no location), as the composer's default time already
  did (`INSIGHTS_BY_BRAND[brand.id]?.best ?? '18:00'`). Found by opening an imported post of
  `chin-mee-chin`; the Drive picker and the location were found in review.

### The accounts (checked 22 Oct)

| Brand | Instagram | TikTok |
| --- | --- | --- |
| casa-vostra | `casavostrasg` (16.6K, 240 posts; bio names Mission Group, links casavostra.sg; the site's footer links it) | `casavostrasg` (159 followers; linked from casavostra.sg) |
| chin-mee-chin | `chinmeechin.sg` (11.7K, 400 posts; "101-year-old bakery by @thisismissiongroup"; linked from chinmeechin.sg) | `chinmeechin.sg` (246 followers; bio "by Mission Group") |
| temper | `temper.sg` (7.3K, 131 posts; "by @thisismissiongroup"; temper.sg lists it) | `temper.sg` (115 followers; bio names Mondrian Singapore Duxton; not linked from the site) |
| petra | `petra.singapore` (442, 7 posts; opening 24 Oct 2026; "by @thisismissiongroup & @casanostrasg") | none: `petra.singapore` exists with no videos and no bio |
| firebird | `firebird.sg` (5K, 104 posts; "by @makotosuetomi & @thisismissiongroup"; linked from firebirdbysuetomi.sg) | none found (`firebird.sg`, `firebirdbysuetomi` do not exist) |
| willow | `willow.restaurant` (17.1K, 261 posts; "by @nictkc \| @thisismissiongroup"; linked from willowrestaurant.sg) | none: `willow.restaurant` exists with no videos and no bio |

### Cost (Apify Free plan: $5 a month, from the API on 22 Oct)

- Instagram post scraper: $0.0017 a post plus $0.001 for detailed data, $0.0027 a post.
- TikTok scraper: $0.0037 a video plus $0.001 a run; Apify's smallest cap for one run is $0.50.
- 150 recent posts each: Instagram 150 + 150 + 131 + 7 + 104 + 150 = 692 posts at most, $1.87;
  TikTok three accounts, $0.56 a run at most. The caps add to $4.10, under the $5 credit; the
  expected cost is lower, as the TikTok accounts are small.

### Tests

- `tests/imports.json`: a post brought in as posted at its local day and time, with address,
  counts and media, seen in `brand.state`; a TikTok post with every count; a second import
  refreshes caption and counts and keeps media (one row, version 2); a post brought in refuses
  edit, move, mark and unplan; an id a BrandBase post holds, in this brand or in another company's
  brand, is 409 and unchanged; two brands that bring in the same post get two posts; an agent, a
  future time, another brand's file, a date that does not exist, an id past 71 characters and bad input (an `fb` channel, a
  negative count, another host, a story) are refused. `isolation.json` calls `post.import` on
  another company's brand (404).
- `import/apify.test.ts`: items shaped as the actors document them; hidden likes (-1) left out;
  errors, other accounts' posts and items with no cover or time skipped; a sidecar, views when
  plays are missing, a hook cut between emoji; newest first, once each.
- `suggestions.test.tsx`: a brand outside the demo gets no suggestions instead of a throw.
  `real-brand.test.tsx`: the composer opens for such a brand with no made-up location, and its
  Drive opens empty (it threw before).
- End to end on a local core (Postgres 16 in Docker, pack 1.6.0 published, tested 161/161,
  migrated, demo seeded): `chin-mee-chin` added with `brand.create`, 7 posts loaded from
  hand-built scrapes (2 items skipped: another account's post, an error), a second load refreshed
  all 5 Instagram posts. Screenshots: week and month views, the post page, Insights, phone week.

### Left for later

- Insights reads nothing from the core, so the counts show nowhere yet. For a real brand it says
  "Nothing yet. The first post out starts them" even with posts. For `casa-vostra` and `temper`
  in production it shows the demo's made-up figures.
- The post page of an imported post ticks no account when the brand has no connection row.
- Ids are one namespace across brands: a person of another company who makes a draft under the id
  an import will use (`<brand>-ig-<shortcode>`) blocks that post (409 on each load).
- Once real posting is on, a post BrandBase sent comes back in the next scrape as a second post:
  `load` does not yet match a scraped id to `post_jobs.external_id`.
- Not tested against Supabase Storage: the end-to-end run used the core's disk storage.
- Applying 1.6.0 to production, and the first real scrape and load (they cost money and write to
  production; they wait for the owner).

## Phase 2: a test scrape, checked against the real accounts

### What ran

The 12 latest Instagram posts of each brand and the 12 latest TikTok videos of Casa Vostra, Chin
Mee Chin and temper (at most $0.33 printed, $0.28 spent), loaded into a local core with the demo
data and the four brands the demo lacks. A reviewer who had not written the code compared the
screenshots and the stored posts with the live accounts.

### What it found and what changed

- **Creators' collab posts.** Instagram returns a creator's post that names the brand as a
  coauthor (`coauthorProducers`), and it shows on the brand's grid; six of Chin Mee Chin's 12 were
  such posts, in the creator's voice and with the creator's reach (166K views against 1–5K on the
  brand's own). The import keeps only the brand's own posts (`ownerUsername`).
- **Hooks.** Styled letters (𝐏𝐨𝐝𝐢𝐮𝐦, 𝕬𝖌𝖊𝖉, U+1D400–1D7FF) become plain ones; dashes and stops at
  the ends of the line go; a line with no letter or digit is skipped; a cut ends in one "…". The
  caption is kept as posted.
- **Invented counts on a real post.** The post page's phone preview printed fixed counts
  ("2,418 likes · View all 86 comments") on a real Temper post with 37 likes and 1 comment. A post
  brought in now carries its `metrics` into web-next (`Post.metrics`, `postOf`), and the Instagram
  and TikTok previews print them, and none it lacks; other posts keep the fixed ones.
- **A cover host this network cannot resolve.** One Willow cover named
  `instagram.fosu2-2.fna.fbcdn.net`; the same path and signature load from
  `scontent.cdninstagram.com`, which the loader now tries second.
- **The cost line.** `scrape` printed the TikTok cap ($0.50, the least Apify takes) as the cost.
  It now prints what the posts cost and the caps (the most Apify can charge), and refuses caps
  that add to more than `--budget`. A real post's preview shows its counts on the account it
  came from, and none on another.

### Found and left as they are

- The post page of a posted post still shows the composer's controls (Improve, upload) beside
  "Already posted: it can be viewed, not changed".
- A video posted to both Instagram and TikTok is two posts with the same cover.
- A single Instagram photo shows the carousel icon (posts have no photo format).
- Some TikTok covers are blurred at the source (the same 48 KB file at `coverUrl` and
  `originalCoverUrl`); one TikTok caption's hashtags come garbled in Apify's `text`.
- Counts are as of the scrape; a later load refreshes them.
- web-next does not show the permalink; there is no "open on Instagram" link yet.
- The Instagram scraper does not return pinned posts; a 150-post scrape reaches them by date.

