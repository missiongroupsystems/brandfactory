import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A source sweep over every GoTrue sign-out call site in `packages/web`.
 *
 * ## Why a sweep and not only a behavioural test
 *
 * `session.test.ts` asserts what `signOut()` does today. That covers the call
 * sites that exist now, and the failure mode here is **the next one somebody
 * adds** — a sign-out on a new account screen, written as `auth.signOut()`
 * because that is what every example and every autocomplete suggests.
 *
 * Nothing about that omission raises, renders differently, or looks wrong in
 * review. Every GoTrue client defaults `signOut()` to **`scope: 'global'`**,
 * which revokes *every* refresh token the person holds **in the project**.
 * Under Mission Passport's hosted login a member's session is issued by
 * **Passport's** project, shared by every consumer app in the suite — so the
 * default turns one app's logout button into a suite-wide logout, taking out
 * every other Mission Systems app and Passport's own console.
 *
 * And the symptom is **delayed**: only the refresh token is revoked, so the
 * other apps keep working on their existing access JWTs and throw everyone out
 * at the next refresh, up to a token lifetime later. Nobody connects "I signed
 * out of BrandFactory" to "the other app logged me out an hour later", so it is
 * filed as flaky sessions — and a fix gets certified by reloading a page in the
 * second app, which passes whether or not the bug is there.
 *
 * A grep passes on the day it is run. This test is the version that keeps
 * passing. Passport's own console carries the same guard, because it shipped
 * this exact bug in both of its sign-out paths until 2026-08-14.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 1c.
 *
 * ## What counts as a call site
 *
 * The GoTrue call, not our own exported wrapper. `session.signOut()` and
 * `useAuth().signOut()` are ours and take no scope by design; the thing that
 * must always carry one is `<client>.auth.signOut(...)`. The pattern therefore
 * anchors on `auth` and tolerates a line break before the method, because the
 * real call in `session.ts` is written across two lines.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_SRC = join(HERE, '..')
const SELF = join(HERE, 'signout-scope.test.ts')

/** `auth` … `.signOut(` — whitespace and newlines tolerated between the two. */
const CALL = /\bauth\s*\.\s*signOut\s*\(/g

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Remove block comments and whole-line `//` comments.
 *
 * Block comments matter because a docblock legitimately *discusses*
 * `supabase.auth.signOut()` while explaining this very rule, and that mention
 * carries no scope. Line comments are stripped only when the whole trimmed line
 * is one: a `//` mid-line could sit inside a string (`'https://…'`), and cutting
 * there could delete a real call further along the line — which would make this
 * guard fail *open*, the one outcome worse than a false alarm.
 */
function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '')
  return withoutBlocks
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

/** The argument text of a call, by balancing parentheses from the open paren. */
function argsAt(source: string, openParenIndex: number): string {
  let depth = 0
  for (let i = openParenIndex; i < source.length; i++) {
    const ch = source[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return source.slice(openParenIndex + 1, i)
    }
  }
  // Unbalanced source would not compile; treat it as empty so the assertions
  // below report it as a missing scope rather than silently passing.
  return ''
}

interface CallSite {
  file: string
  line: number
  args: string
}

function signOutCallSites(): CallSite[] {
  const sites: CallSite[] = []
  for (const file of sourceFiles(WEB_SRC)) {
    if (file === SELF) continue
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const match of source.matchAll(CALL)) {
      const openParen = match.index + match[0].length - 1
      sites.push({
        file: relative(WEB_SRC, file).replace(/\\/g, '/'),
        line: source.slice(0, match.index).split('\n').length,
        args: argsAt(source, openParen),
      })
    }
  }
  return sites
}

describe('GoTrue sign-out scope', () => {
  it('finds the call sites at all, so the guard is guarding something', () => {
    // Without this the whole file passes vacuously the day the pattern stops
    // matching — a green test that checks nothing is worse than no test.
    expect(signOutCallSites().length).toBeGreaterThan(0)
  })

  it('passes an explicit scope at every call site', () => {
    const bare = signOutCallSites()
      .filter((site) => !site.args.includes('scope'))
      .map((site) => `${site.file}:${site.line}`)

    expect(
      bare,
      'GoTrue defaults to scope: "global", which revokes every refresh token this ' +
        'person holds in the project — every other app in the suite, plus ' +
        "Passport's console. Silence is not neutrality here. Pass { scope: 'local' }.",
    ).toEqual([])
  })

  it('never names global or others', () => {
    const broad = signOutCallSites()
      .filter((site) => /['"](global|others)['"]/.test(site.args))
      .map((site) => `${site.file}:${site.line}`)

    expect(
      broad,
      'A consumer has no legitimate use for either scope. "Sign out everywhere" ' +
        "lives in one place suite-wide — the Passport console's confirmed action. " +
        '`others` is not a middle ground: same blast radius, minus this tab.',
    ).toEqual([])
  })

  it('does not redirect the ordinary sign-out button at Passport /logout', () => {
    // A different promise from "sign out of this app": it ends the person's SSO
    // session, so the next app they open makes them sign in again. Shippable
    // only as a separate, differently-labelled control — never as this button.
    const offenders = sourceFiles(WEB_SRC)
      .filter((file) => file !== SELF)
      .filter((file) =>
        /passport[^\n]*\/logout|\/logout[^\n]*passport/i.test(readFileSync(file, 'utf8')),
      )
      .map((file) => relative(WEB_SRC, file).replace(/\\/g, '/'))

    expect(offenders).toEqual([])
  })
})
