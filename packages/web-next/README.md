# brand base demo

A click-through demo of brand base for restaurant marketing teams: Schedule, Ideate (with the
shoot brief board) and Insights, for three brands (Casa Vostra, Temper, Carlitos). It runs on
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

1. **Schedule** opens on this week, with thumbnails. Switch to **Month** (a count per platform
   per day) and click a day to open it in **Day** (an hour rail with the best time shaded). The
   stage icon beside Layers filters by stage.
2. **Schedule new post** opens the composer: tick several accounts at once, pick a format, add
   media, **Draft with AI**, change one account's text in its own tab, answer TikTok's question,
   pick a best time, then **Schedule on 4**. Back on the calendar, the post is on its day.
3. **Insights**: the four numbers, what worked, when to post, every post, every creator. Click
   **Turn into idea**, then **Plan it**.
4. **Shoot brief** (you land here): pick a status and a date, tick a shot, drag a card to
   Scheduled. **Open in scheduler** takes a planned card to the composer.
5. **Ideate** opens on the **Moodboard**: connect Pinterest, Instagram and TikTok into one
   board. **Current ideas** shows one idea at a time: move with the strip or the arrow keys,
   **Sharpen** the hook, **Plan it** on the shoot brief.

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
