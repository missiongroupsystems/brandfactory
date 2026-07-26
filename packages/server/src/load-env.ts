import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// dotenv's `dotenv/config` only reads `.env` from `process.cwd()`, which under
// `pnpm -F @brandfactory/server dev` is this package directory — so the
// repo-root `.env` that `.env.example` tells contributors to create was
// silently ignored, and `pnpm dev` failed env validation out of the box.
//
// Load the repo-root file first (the documented location), then a package-local
// `.env` for overrides. dotenv never clobbers a var already in `process.env`,
// so a platform that injects real secrets (Fly, CI) always wins, and a missing
// file is a no-op — this is safe in production where there is no `.env` at all.
//
// Imported for its side effect before any module that reads env (`@brandfactory/db`).
const here = dirname(fileURLToPath(import.meta.url))
const rootEnv = resolve(here, '../../../.env')
if (existsSync(rootEnv)) config({ path: rootEnv })
config()
