import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PASSPORT_LOGIN_ERROR_CODES, loginErrorMessage } from './resolveLogin'

/**
 * A cross-package sweep: every `?error=` code the SERVER redirects with must have copy in
 * the browser.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6B.
 *
 * ## Why this needs a test at all
 *
 * The two halves are in different packages and there is **no type between them** — the
 * code crosses as a string in a URL, written by `packages/server/src/routes/passport-auth.ts`
 * and read by `resolveLogin.ts`. `pnpm typecheck` cannot see the seam, so adding a
 * `fail('passport_misconfigured')` on the server compiles, lints, passes every server test,
 * and ships.
 *
 * And it fails **silently, in the worst available way**: `loginErrorMessage` returns null
 * for an unknown code, so the person is redirected to a login screen with **no error
 * message at all**. Sign-in simply does not work, nothing is logged in the browser, and
 * the only evidence is a query parameter nobody looks at. The alternative — a catch-all
 * `default:` — trades that for a different silent failure, showing an SSO message when
 * Supabase's own magic-link error arrives in the same parameter.
 *
 * So the closed set is the design, and this is what keeps it closed.
 *
 * ## What it does not check
 *
 * That the copy is *right* for the code. `resolveLogin.test.ts` covers the two cases where
 * the wording is load-bearing (`no_access` must not say "try again"; the retryable classes
 * must name the magic link).
 */
const here = dirname(fileURLToPath(import.meta.url))
const SERVER_ROUTE = join(here, '../../../server/src/routes/passport-auth.ts')

/**
 * Codes are extracted from `fail('…')` calls, the one helper both browser-facing routes
 * redirect through. A code built by string concatenation would slip past this — accepted,
 * because there is no reason to build one dynamically and a regex cannot follow it anyway.
 */
function serverErrorCodes(source: string): string[] {
  const found = new Set<string>()
  for (const m of source.matchAll(/\bfail\(\s*['"]([a-z0-9_]+)['"]/g)) {
    if (m[1]) found.add(m[1])
  }
  return [...found].sort()
}

describe('the login error codes the server emits', () => {
  const source = readFileSync(SERVER_ROUTE, 'utf8')

  it('finds the server route and its fail() calls', () => {
    // Every assertion below is a subset check, so a moved file or a renamed helper would
    // make them all pass while checking nothing.
    expect(source.length).toBeGreaterThan(0)
    expect(serverErrorCodes(source).length).toBeGreaterThan(0)
  })

  it('every server code has copy in the browser', () => {
    const missing = serverErrorCodes(source).filter((c) => loginErrorMessage(c) === null)
    expect(missing).toEqual([])
  })

  it('every server code is in the declared closed set', () => {
    const declared = new Set<string>(PASSPORT_LOGIN_ERROR_CODES)
    expect(serverErrorCodes(source).filter((c) => !declared.has(c))).toEqual([])
  })

  it('the closed set has no code the server never sends', () => {
    // The other direction, and it is not pedantry: a code left here after the server stops
    // sending it is dead copy that reads as covered ground, and the next person adding a
    // failure path picks the stale name because it is already in the list.
    const emitted = new Set(serverErrorCodes(source))
    expect(PASSPORT_LOGIN_ERROR_CODES.filter((c) => !emitted.has(c))).toEqual([])
  })
})
