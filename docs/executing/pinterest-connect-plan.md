# Plan: the real Pinterest connection (brandbase 1.7.0)

## Why

The marketing team starts on production on 23 Oct 2026. On the core every platform shows the
amber "Not available yet" (2.35.2), Pinterest included. Pinterest has an app ("Mission Systems
Brand Base", id 1627547, Trial access) and the Fly app `brandfactory` holds its secrets, so the
moodboard's Pinterest source can be real now: each brand links its own Pinterest account and
picks one board, and the moodboard reads that board's pins live. Instagram, TikTok and Facebook
stay "Not available yet" until their apps pass review.

The code exists on the local branch `feat/real-publishing` (87f2a96, never pushed), built on the
old `perf/core-plan-once` with brandbase 1.4.0. This plan ports only what Pinterest needs onto
`fix/onboarding-polish` (brandbase 1.6.0), which is about to merge to `main`.

## What moves

- **Core** (generic, no business words): internal moves (`internal: true`: only code beside the
  core calls them, never a screen's `/ops`, an agent's tool or a guest), secret input fields
  (`secret: [...]`, kept out of the call log), the test runner calls as code beside the core, and
  `serveCore(extend)` so a host adds its own routes. The connector changes on
  `feat/real-publishing` (send outcomes, timeouts, ten calls at once) stay there: Pinterest posts
  nothing.
- **Pack 1.7.0**: `brandbase.accounts` (migration `0015_accounts.sql`, renumbered from 0012), the
  moves `account.link`, `account.read`, `account.retoken`, `account.board`, `account.forget`
  (internal; platform `pinterest` only), `brand.state` names the linked Pinterest account (never
  its tokens), and `connection.set` no longer takes `pinterest`: that connection follows the
  account. A stored `pinterest` connection from the pretend sign-in turns off.
- **connect**: `src/brandbase/` with Pinterest only: the sealing, the Pinterest client (OAuth,
  boards, pins), the account routes, the environment check and `host.ts`, the server's entry.
  `GET /platforms` tells the web app which platforms have an app set up.
- **Image**: the core's Dockerfile builds and runs `packages/connect`'s host; `.dockerignore` lets
  connect's source in; `fly.toml`'s release command takes the core's CLI from `node_modules`.
- **web-next**: the `/connect/pinterest` page Pinterest returns to, the moodboard's board picker,
  the live board on the moodboard, and Connections' Pinterest row with a real Connect. Pinterest
  is offered only when the server's `GET /platforms` says so; otherwise it stays amber.

## Decisions

1. **Scopes `boards:read`, `pins:read`, `user_accounts:read`.** These are what the Trial app has.
   `feat/real-publishing` also asked for `boards:read_secret` and `pins:read_secret`; without
   them a secret board does not list. Add them when the app is granted them.
2. **The table keeps all three platforms in its check** (`pinterest`, `meta`, `tiktok`), so Meta
   and TikTok need no table change later; the moves accept `pinterest` only until then.
3. **A capability flag from the server**, not a build-time guess: `GET /platforms` answers from
   the host's environment, so turning Pinterest on or off is a secret change and a restart. A core
   without the host answers 404, read as "none".
4. **Pins are read once per page load, for a brand a screen shows**, not on every state reload
   (the tab back in view) and not for every brand the person reaches: Trial allows 1,000 reads a
   day for the whole app.
5. **The server deploys before the pack.** The core now on Fly does not know `internal`: under
   it, 1.7.0's account moves would be open to screens and agents.

## Production steps (not done: the owner runs them)

See the completion document's "Production steps".
