import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A source sweep: **only a sign-in may state the token issuer.**
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6B.
 *
 * ## Why the store's own tests are not enough
 *
 * `setAuth(token, userId)` preserves the recorded issuer, and `session.test.ts` pins that.
 * What no behavioural test can catch is the **next edit**: somebody reads
 * `setAuth(token, data.id)` in `AuthBoundary`, sees a two-argument call to a
 * three-parameter function, and "completes" it with `'app-native'`. It compiles, it lints,
 * every existing test still passes, and the reviewer sees a line that looks more explicit
 * than what it replaced.
 *
 * What it actually does is rewrite a hosted-login session as app-native on **every page
 * load**, because that probe runs on every load of a signed-in app. From then on the refresh
 * and the sign-out both address the wrong GoTrue project.
 *
 * The symptom is delayed and silent, which is why it needs a guard rather than care: the
 * reload works, every request works, and roughly an hour later the person is signed out with
 * nothing in any log. Nobody attributes that to a page refresh.
 *
 * ## The rule
 *
 * A `setAuth` call may carry an issuer **only** in a file that performs a sign-in. Everything
 * else re-confirms a session it did not create, and must omit the argument.
 */
const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '..')

/**
 * The files that decide an issuer, because each is the point where a session is CREATED and
 * therefore the only place that knows which project issued it.
 *
 * Adding a file here is a real decision: it is a claim that the file is a sign-in. Adding one
 * to silence this test is how the guard gets defeated.
 */
const SIGN_IN_FILES = [
  'auth/providers/supabase.tsx', // magic link + Google, against the app's own project
  'auth/providers/local.tsx', // the dev token
  'routes/auth.passport.complete.tsx', // hosted login, against Passport's project
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Counts the arguments of a `setAuth(...)` call by scanning to its matching parenthesis and
 * splitting on top-level commas. A regex cannot do this — the third argument may be a
 * conditional or a call — and undercounting would make the sweep fail OPEN.
 *
 * String literals are not tracked, so a comma inside one would miscount. Accepted: every
 * argument here is an identifier or a short literal, and the failure direction is a false
 * positive, which somebody investigates.
 */
function setAuthArity(source: string, from: number): number | null {
  let depth = 0
  let args = 1
  for (let i = from; i < source.length; i++) {
    const ch = source[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return args
    } else if (ch === ',' && depth === 1) args++
  }
  return null
}

interface Call {
  file: string
  arity: number
}

function findCalls(): Call[] {
  const calls: Call[] = []
  for (const file of walk(SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const m of source.matchAll(/\bsetAuth\s*\(/g)) {
      const open = m.index + m[0].length - 1
      // The store's own definition is `setAuth: (token, userId, issuer) =>`, not a call.
      if (/setAuth:\s*$/.test(source.slice(Math.max(0, m.index - 20), m.index + 8))) continue
      const arity = setAuthArity(source, open)
      if (arity !== null) {
        calls.push({ file: relative(SRC, file).replace(/\\/g, '/'), arity })
      }
    }
  }
  return calls
}

describe('who may state the token issuer', () => {
  const calls = findCalls()

  it('finds the setAuth call sites', () => {
    // Every assertion below filters this list, so an empty one would pass them all while
    // checking nothing.
    expect(calls.length).toBeGreaterThanOrEqual(4)
  })

  it('only a sign-in file passes an issuer', () => {
    const offenders = calls
      .filter((c) => c.arity >= 3 && !SIGN_IN_FILES.includes(c.file))
      .map((c) => c.file)
    expect(offenders).toEqual([])
  })

  it('every non-sign-in call omits it, so the recorded issuer survives', () => {
    const wrong = calls.filter((c) => !SIGN_IN_FILES.includes(c.file) && c.arity !== 2)
    expect(wrong).toEqual([])
  })

  it('every sign-in file DOES state one, rather than leaning on the default', () => {
    // The other direction. A sign-in that omits the issuer inherits whatever the previous
    // session left behind — so a person who signed in through Passport, signed out, and then
    // used a magic link would be recorded as `passport` and refresh against the wrong
    // project. `logout()` clears the key, which covers the ordinary path; this covers the
    // rest.
    const silent = SIGN_IN_FILES.filter((f) => !calls.some((c) => c.file === f && c.arity >= 3))
    expect(silent).toEqual([])
  })
})
