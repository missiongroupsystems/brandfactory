import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A source sweep: **the browser never asks GoTrue for a magic link directly.**
 *
 * Plan: the magic-link proxy — phase 6d's recorded gap.
 *
 * ## What this protects, and why a behavioural test is not enough
 *
 * `/auth/resolve-login` decides whether an address belongs to Passport's hosted login. That
 * decision is only *enforcement* because the magic link now goes through our own server, which
 * refuses an active member. `supabase.test.tsx` pins that for the call site that exists today.
 *
 * The failure mode is **the next one somebody adds**: a `signInWithOtp` on a new invite screen,
 * a re-send button, an account page — written that way because it is one line, it is what
 * every Supabase example shows, and it is what autocomplete offers.
 *
 * Nothing about it looks wrong. It works. The person gets their link. What it does is reopen
 * the hole: a Passport member can authenticate against BrandFactory's own project and bypass
 * Passport's MFA, session policy, revocation and audit entirely — and the only visible
 * difference is an absence, in a log nobody is reading.
 *
 * ## What counts
 *
 * `signInWithOtp` anywhere in `packages/web`, and `/auth/v1/otp` — GoTrue's REST endpoint,
 * which is the same call with the SDK peeled off and the obvious way around a rule about a
 * method name.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_SRC = join(HERE, '..')
const REPO_ROOT = join(WEB_SRC, '..', '..', '..')
const SELF = 'packages/web/src/auth/magic-link-proxy.test.ts'

/**
 * The one file that may name it — and it names it to assert the OPPOSITE.
 *
 * `supabase.test.tsx` stubs `signInWithOtp` so it can assert
 * `expect(h.signInWithOtp).not.toHaveBeenCalled()`, which is the behavioural half of this
 * guard. Flagging it would force somebody to delete the very test that proves the browser
 * stopped calling GoTrue.
 *
 * **Nothing else belongs here, including other tests.** A suite that stubs this method is
 * normally a suite testing a component that calls it, which is the thing being prevented.
 */
const ALLOWED = ['packages/web/src/auth/providers/supabase.test.tsx']

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo'])

const PATTERN = /\bsignInWithOtp\b|\/auth\/v1\/otp/

/** Strip comments, keeping line numbers — the same shape as the repo's other sweeps. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => '\n'.repeat((block.match(/\n/g) ?? []).length))
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

export function findDirectOtpCalls(
  file: string,
  rawSource: string,
): { file: string; line: number }[] {
  if (file === SELF || ALLOWED.includes(file)) return []
  return stripComments(rawSource)
    .split('\n')
    .map((line, i) => ({ line: i + 1, hit: PATTERN.test(line) }))
    .filter(({ hit }) => hit)
    .map(({ line }) => ({ file, line }))
}

function sourceFiles(dir = WEB_SRC): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    out.push({
      path: relative(REPO_ROOT, full).replace(/\\/g, '/'),
      text: readFileSync(full, 'utf8'),
    })
  }
  return out
}

describe('the magic link goes through our server', () => {
  describe('the detector itself', () => {
    it('catches the SDK call', () => {
      expect(
        findDirectOtpCalls(
          'packages/web/src/x.tsx',
          'await client.auth.signInWithOtp({ email })\n',
        ),
      ).toEqual([{ file: 'packages/web/src/x.tsx', line: 1 }])
    })

    it('catches the REST endpoint, which is the same call with the SDK peeled off', () => {
      // The obvious way around a rule about a method name.
      expect(
        findDirectOtpCalls('packages/web/src/x.tsx', 'fetch(`${url}/auth/v1/otp`, { … })\n'),
      ).toHaveLength(1)
    })

    it('ignores a mention in a comment', () => {
      // The provider's own header explains, by name, why this call moved to the server.
      expect(
        findDirectOtpCalls(
          'packages/web/src/x.tsx',
          '// this used to be signInWithOtp\n/* /auth/v1/otp */\n',
        ),
      ).toEqual([])
    })
  })

  it('finds no direct call anywhere in the web package', () => {
    // A mock of it in a test counts as a hit, on purpose: a suite that stubs `signInWithOtp`
    // is normally a suite testing a component that calls it. The single exception is the
    // provider's own suite — see `ALLOWED`.
    expect(sourceFiles().flatMap((f) => findDirectOtpCalls(f.path, f.text))).toEqual([])
  })

  it('the behavioural half of this guard still exists', () => {
    // The allow-list is only safe while that assertion is there. If somebody deletes it, this
    // sweep is the only thing left — and it would be allow-listing a file for a reason that
    // has stopped being true.
    const provider = sourceFiles().find((f) => f.path === ALLOWED[0])
    expect(provider, 'the provider suite was moved or deleted').toBeDefined()
    expect(provider!.text).toMatch(/signInWithOtp\)\.not\.toHaveBeenCalled/)
  })

  it('swept something', () => {
    expect(sourceFiles().length).toBeGreaterThan(50)
  })
})
