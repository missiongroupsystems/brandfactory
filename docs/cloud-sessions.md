# Cloud sessions

How a Claude cloud session works on this repository with no one's computer. The session's
environment is `brandfactory` (personal).

## What a session has

- **Node 24.13.0** (`.nvmrc`), installed by the setup script, and the repository's packages.
- **Postgres 16** in the image: `scripts/test-pg.sh` starts it, makes a throwaway database and runs
  the core's tests on it, so the tests PGlite skips run too.
- **The live app and its servers**, for browser tests: `branding.missionsystems.ai`,
  `brandfactory.fly.dev`, `brandbase-bubbles.fly.dev`, and the Supabase project's sign-in and files
  (`qcxikcauwonrbftqiitp.supabase.co`).
- **A test sign-in** for those tests, in the variables `QA_EMAIL` and `QA_PASSWORD` (the owner
  sets them in the environment's settings; a session never asks for them in chat).

## What a session cannot do, and what does it instead

A session reaches the internet through an HTTPS proxy only: no Postgres connection to Supabase,
and no Fly deploy. The workflow **Production** (`.github/workflows/production.yml`) does those
steps on GitHub, and a session starts it and reads its log with the GitHub tools:

| Task | Does |
| --- | --- |
| `check` | read only: the server's health, the live pack version, how each Instagram and Facebook account is linked |
| `release` | the pack: publish, test, migrate, promote `version`; people's loadouts follow it (`packages/core/scripts/loadouts.ts`) |
| `deploy` | the server: `fly deploy`, then `/health` |

The web app deploys from `main` on Vercel.

## A release

1. Merge to `main` (CI green).
2. Run **Production** with `release` and the pack's version, when the pack changed.
3. Run **Production** with `deploy`, when `packages/core`, `packages/connect` or `fly.toml` changed.
4. Test the live app in a browser with the test sign-in.

## The workflow's settings

In GitHub: Settings, Secrets and variables, Actions (repository level: no admin rights needed).

- Secrets: `CORE_LOGIN_PASSWORD` and `CORE_MIGRATOR_PASSWORD` (Keychain service
  `brandbase-supabase-db`), `RELEASE_PASSWORD` (the sign-in of the person a promote acts for),
  `FLY_API_TOKEN` (`fly tokens create deploy -a brandfactory`).
- Variables: `RELEASE_EMAIL` (that person's email), `SUPABASE_ANON_KEY` (the project's public key).
