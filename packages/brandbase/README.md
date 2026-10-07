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
git checkout feat/brandbase-mvp
corepack enable                      # gives you the pnpm version the repo pins
pnpm install
pnpm -F @brandfactory/brandbase build
pnpm -F @brandfactory/brandbase start
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

1. **Schedule**: the month of posts, stories and events. Drag a post to another day. Click a reel
   to open Publish and send it to every channel from one button.
2. **Insights**: the four numbers on top, then what worked. Hover any chart. Open **Creators** to
   show what each creator earned in views and engagement. Click **Turn into idea**, then
   **Plan it**.
3. **Shoot brief** (you land here): the idea is open. Pick a date and a status, tick a shot.
   Drag another card from Idea to Filming.
4. **Schedule** again: the calendar shows what the brief decided.
5. **Ideate**: every reel, carousel and story with its status. Click **Suggest the last 3**,
   then **Pinterest** → **Connect Pinterest** and start an idea from a pin.

## Checks

```bash
pnpm -F @brandfactory/brandbase test
pnpm -F @brandfactory/brandbase build
```

Photo credits are in `public/demo/CREDITS.md`.
