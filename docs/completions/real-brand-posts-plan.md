# Plan: the brands' real posts (brandbase 1.6.0)

## Why

David (22 Oct): the marketing team is confused when BrandBase does not show their real brands.
He asked to scrape each brand's real Instagram posts (TikTok if easy), store them, and make
BrandBase feel like the tool they use, with Apify's free credit.

## What the screens show today

- **Calendar** reads `brand.state`'s posts. A post with `marked = 'posted'` and no jobs reads as
  posted (`brandbase.stage`), on its `day` and `time`, with `media[0].src` as its tile. No move
  makes a past posted post: `post.create_draft` refuses a past day (`post.day_not_past`).
- **Insights** is static only (`INSIGHTS_BY_BRAND`, `HUB_BY_BRAND`, keyed by the three demo ids).
  It reads nothing from the core. A brand outside the demo sees "Nothing yet". The production ids
  `casa-vostra` and `temper` equal two demo ids, so those two real brands show the demo's made-up
  Insights.
- **Moodboard** is other accounts' posts (inspiration), not the brand's own.
- **Composer, suggestions, idea page** index static demo tables by brand id. For a brand outside
  the demo (four of the six in production) the post page throws.

## The model

- `posts` gains `permalink`, `metrics` (jsonb: likes, comments, views, shares, saves, each
  optional) and `measured_at`. A post BrandBase made has none of them. `post_json` adds
  `measuredAt` in the same form as `createdAt`. Migration `0014_imported_posts.sql`.
- `post.import`: `{ brand, channel: ig|tt, externalId, format: reel|carousel, hook, caption?, at,
  permalink, media?, metrics }`. The id is `<brand>-<channel>-<externalId>`, so a second import of
  the same post is an upsert: it refreshes hook, caption, counts and `measured_at` and keeps the media. It
  refuses an id that a post BrandBase made holds, or another brand holds (409 `ID_TAKEN`). Day and
  time are `at` in the brand's zone. Rules: `brand.reachable`, `post.import_id_fits` (400 `ID_TOO_LONG` past 71 characters, so every
  move that names a post can name it and its cover's id fits in 80), `post.import_by_a_person` (403 for
  an agent: an agent must not write counts), `post.import_past` (400 `NOT_OUT_YET`),
  `post.media_in_brand`. The stage is posted, so every move that changes a post refuses it.
- An Instagram photo is a one-image carousel (posts have no photo format); a reel or TikTok video
  is a reel; a TikTok slideshow is a carousel. Only the cover is copied (the calendar shows only
  `images[0]`), which keeps storage small.

## The import

`packs/brandbase/import/`: `apify.ts` maps one actor item to `post.import`'s input (pure, tested);
`run.ts scrape` runs the actors for `accounts.json` (cost printed first, nothing run without
`--yes`, each run capped with `maxTotalChargeUsd`); `run.ts load` copies each new post's cover
through `media.create` and its signed URL, then calls `post.import` as the signed-in person.
Covers are copied because the platforms' image addresses expire within days.

Actors: `apify/instagram-post-scraper` with detailed data (a reel's views come only with it) and
`clockworks/tiktok-scraper` on a profile's videos.

## Not in this plan

Insights from the imported counts (a design job), the static demo data that `casa-vostra` and
`temper` pick up in production, comments and creators, more than the cover of a carousel,
scheduled refreshes of the counts.
