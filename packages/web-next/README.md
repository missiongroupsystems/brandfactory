# brand base demo

A click-through demo of brand base for restaurant marketing teams: Schedule, Ideate (with a page
per idea) and Insights, for three brands (Casa Vostra, Temper, Carlitos). It runs on
your laptop with no server, database or sign-in. All data is static and every change lives in
memory.

## Run it

You need Node 20.11 or later and git.

```bash
git clone https://github.com/missiongroupsystems/brandfactory.git
cd brandfactory
corepack enable                      # gives you the pnpm version the repo pins
pnpm install
pnpm -F @brandfactory/web-next build
pnpm -F @brandfactory/web-next start
```

Open http://localhost:3002.

Use `build` + `start` for a demo, not `dev`. Dev mode compiles each page on first visit (slow
clicks in front of a client) and reloads the page when files change, which wipes the demo state.

## Before and during a demo

- **A reload resets everything** to the starting state. Do it between clients; avoid it during
  one. Move between pages with the links at the top, not the address bar.
- "Today" is fixed at Tuesday 6 October 2026, so the calendar always looks the same.
- The brand switcher is the pill at the top right.

## A two-minute path

1. **Schedule** opens on this week, with thumbnails; an idea shows its photo with a small spark.
   Switch to **Month** (a count per platform per day, from the 1st) and click a day to open it in
   **Day** (an hour rail with the best time shaded). The filter button beside the views filters by
   stage and by layer.
2. **Schedule new post** opens the composer: start from an idea or add media, crop a photo (the
   crop button on its tile), tick several accounts, pick a format, **Draft with AI**, change one
   account's text in its own tab, pick a best time, then **Schedule on** under the preview, or
   **Save draft**. Back on the calendar, the post is on its day.
3. **Ideate** opens on the **Moodboard**: connect Pinterest, Instagram and TikTok into one board,
   pick a few posts, then **Plan idea from this**: the new idea opens on its own page (inspiration,
   shots, status, date). **Current ideas** is every idea with its inspiration posts: a card or
   **Brief** opens its page, **Plan it** puts it on the calendar, **Sharpen** offers stronger hooks.
4. **Insights**: what worked, when to post, every post, every creator. Click **Turn into idea**,
   then **Plan it**: the idea opens on its own page.

## Docs (at the repo root)

- `docs/executing/brandbase-schedule-v2-plan.md`: the current plan, what we take from Brandwatch, and the API notes
  for the real build (per-platform rules, what can be synced, brand-account isolation).
- `docs/completions/brandbase-demo-plan.md`: how the demo was first built, and its earlier redesigns.
- `docs/executing/brandbase-accounts-integration.md`: how to connect real Pinterest, Instagram, Facebook and TikTok
  accounts, what to ask the client, and the minimum backend.
- `docs/changelog.md`: what changed, newest first.

## Checks

```bash
pnpm -F @brandfactory/web-next test
pnpm -F @brandfactory/web-next build
```

Photo credits are in `public/demo/CREDITS.md`.
