import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The Passport conformance detectors, as a test.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 10.
 *
 * ---------------------------------------------------------------------------
 * Why these are a TEST and not a checklist somebody runs
 * ---------------------------------------------------------------------------
 *
 * Every rule below **passes silently when violated.** Nothing errors, nothing renders
 * differently, no request fails: the app simply serves stale or over-broad answers, and
 * you find out from a user who can still see a brand they were removed from. A grep
 * passes on the day somebody runs it; this is the version that keeps running.
 *
 * Three of the five detectors are pure absence checks and are clean today. Two are not,
 * and they are handled honestly rather than skipped:
 *
 * - **Shadow tables (rule 7)** — `workspaces` and `brands` still exist, because
 *   retiring them is phase 8. So the assertion is not "there are none" but "there are
 *   exactly these two". A THIRD one fails here, and phase 8 removing them fails here
 *   too, which forces the list to shrink rather than rot.
 * - **`organization_id` on every app-owned table (rule 9)** — also phase 8. The
 *   *dangerous* half of rule 9 is assertable now and is: no configured org reaches a
 *   query or a guard.
 *
 * ---------------------------------------------------------------------------
 * One check asserts PRESENCE, which is the mirror-image failure
 * ---------------------------------------------------------------------------
 *
 * Rule 3 is proven by absence, so the natural instinct when sweeping for "writes to
 * Passport" is to delete everything that talks to it. That is its own failure, and a
 * worse one: `session-exchange`, the registry read, `snapshot()` and token verification
 * are reads and redemptions, **not** writes, and deleting any of them takes login or
 * placement down rather than leaking anything. So the last block below insists they
 * still exist.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGES = join(HERE, '..', '..', '..')
const REPO_ROOT = join(PACKAGES, '..')
const SELF = 'packages/server/src/passport/conformance.test.ts'

const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo'])

interface SourceFile {
  path: string
  text: string
}

function sourceFiles(dir = PACKAGES): SourceFile[] {
  const out: SourceFile[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    const path = relative(REPO_ROOT, full).replace(/\\/g, '/')
    if (path === SELF) continue
    out.push({ path, text: readFileSync(full, 'utf8') })
  }
  return out
}

/**
 * Blank out comments, KEEPING the line count so reported line numbers stay true.
 *
 * Not defensiveness: these files document the very patterns they are forbidden to use.
 * The collapse detector below matched a docblock explaining why collapsing is wrong, and
 * the vocabulary detector would match every warning about `is_admin`. The upstream
 * guidance calls those "read the hits" detectors for exactly this reason — stripping
 * comments is what turns them into assertions.
 *
 * A mid-line `//` is left alone: it can sit inside a string (`'https://…'`), and cutting
 * there could delete real code further along the line, which would make the sweep fail
 * OPEN — the one outcome worse than a false alarm.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => '\n'.repeat((block.match(/\n/g) ?? []).length))
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

/** Every `path:line` where `pattern` matches, excluding the given files. */
function hits(pattern: RegExp, allow: readonly string[] = []): string[] {
  const found: string[] = []
  for (const file of sourceFiles()) {
    if (allow.includes(file.path)) continue
    stripComments(file.text)
      .split('\n')
      .forEach((line, i) => {
        // A fresh regex per line: a `g` flag would carry `lastIndex` between calls.
        if (new RegExp(pattern.source, pattern.flags.replace('g', '')).test(line)) {
          found.push(`${file.path}:${i + 1}`)
        }
      })
  }
  return found
}

const ALL_FILES = sourceFiles()

describe('passport conformance detectors', () => {
  it('sweeps a plausible number of files, so a broken walk cannot pass vacuously', () => {
    // Every assertion below is an absence check, so a walk that returns nothing passes
    // all of them while checking nothing at all.
    expect(ALL_FILES.length).toBeGreaterThan(100)
  })

  // §0 — the wire contract is current, not pre-v1.
  //
  // The `grep -v` is not optional: `app_membership` is a SUBSTRING of the CURRENT name
  // `unit_app_membership`, so the naive pattern flags a perfectly healthy consumer as
  // stale — and acting on that verdict means rewriting a working integration. Likewise
  // the stale helper is `roles_at_brands`/`rolesAtBrands`; grepping for the CURRENT
  // name would flag everything.
  it('§0 — carries no pre-v1 aggregate, header or helper name', () => {
    const stale = hits(
      /unit_membership|\bapp_membership\b|acting_subject|X-Acting-Subject|roles_at_brands|rolesAtBrands/,
    ).filter((hit) => {
      const [path, line] = hit.split(':')
      const text = ALL_FILES.find((f) => f.path === path)!.text.split('\n')[Number(line) - 1] ?? ''
      // Drop the current names, which legitimately contain the stale substrings.
      return !/unit_app_membership|unit_app_access/.test(text)
    })

    expect(stale, 'a surviving hit means the consumer is on a pre-v1 contract').toEqual([])
  })

  // §0b(A) — rule 7. A shadow table is any local table carrying an aggregate's name,
  // status, type, org linkage, structure, membership or role.
  //
  // Asserted as an exact set rather than as emptiness, because two are still pending.
  it('§0b — holds exactly the two shadow tables phase 8 retires, and no more', () => {
    const declared = new Set<string>()
    for (const file of ALL_FILES) {
      if (!file.path.startsWith('packages/db/src/schema/')) continue
      // The projection's own tables are declared through `passportSchema.table(...)`,
      // so matching only bare `pgTable(` excludes them by construction.
      for (const m of file.text.matchAll(/pgTable\(\s*'([a-z_]+)'/g)) declared.add(m[1]!)
    }

    const SHADOW_NAMES =
      /^(orgs?|organi[sz]ations?|brands?|outlets?|locations?|venues?|sites?|units?|memberships?|roles?|user_roles?|workspaces)$/
    const shadows = [...declared].filter((t) => SHADOW_NAMES.test(t)).sort()

    // `workspaces` -> passport.organization and `brands` -> passport.unit, in phase 8.
    // A THIRD entry here is a new shadow; a SHORTER list means phase 8 landed and this
    // expectation must shrink with it.
    expect(shadows).toEqual(['brands', 'workspaces'])
  })

  // §0b(B) — rule 8. Passport's vocabulary is read verbatim: `Owner|Admin|Member` and
  // `Manager|Staff`, never mapped onto a local enum or collapsed into a flag.
  it('§0b — declares no local role vocabulary', () => {
    const vocabulary = hits(
      /\b(user_type|userType|is_admin|isAdmin|is_manager|isManager|_ROLE_MAP|role_projection|effective_role|effectiveRole)\b/,
    )
    expect(
      vocabulary,
      'a local role vocabulary re-introduces the over-grant unit-scoped checks remove',
    ).toEqual([])
  })

  // Rule 8's other half, and the one a global flag would survive: the derivation must
  // never be collapsed into a single answer.
  it('§0b — never collapses rolesAtUnits into one effective role', () => {
    const collapsed = hits(
      /(Object\.values\(\s*roles|rolesByUnit\s*\)\s*\.(includes|some|every)|Object\.values\(\s*rolesByUnit)/,
    )
    expect(
      collapsed,
      'a person may be Manager at one unit and Staff at another; there is no effective role',
    ).toEqual([])
  })

  // §0c — rule 9. The dangerous half: a configured org reaching a query, a handler guard
  // or an authz check silently discards every other org's events, permanently, and no
  // reconciliation heals it while the filter is there.
  it('§0c — no configured organisation reaches any query or guard', () => {
    const orgFilter = hits(/PASSPORT_ORG_ID|passportOrgId/, [
      // The two places that REFUSE it by name, which is the opposite of using it.
      'packages/server/src/env.ts',
      'packages/server/src/env.test.ts',
    ])
    expect(orgFilter, 'org_id is a request-path argument, never a setting').toEqual([])
  })

  // §0d — rule 3. Six App API methods are closed by policy and answer 410. A closed
  // method that is merely unused today is one bug-fix away from being used again.
  it('§0d — calls none of the closed write-back methods', () => {
    const closed = hits(
      /\b(assignUnitAppRole|setUnitAppRole|removeUnitAppRole|reportIdentityLink|updateMembership)\s*\(/,
    )
    expect(closed, 'these are CLOSED by policy and answer 410 Gone').toEqual([])
  })

  it('§0d — hand-rolls no HTTP around the closed routes', () => {
    // Deleting the SDK call and re-issuing the same request with `fetch` is the obvious
    // dodge, and it is invisible to the check above.
    const dodge = hits(/apps\/me\/identity-links|apps\/me\/orgs\/[^\n]*unit-app-membership/)
    expect(dodge, '/apps/me/identity-links has no legal hit at all').toEqual([])
  })

  /**
   * §0d, the EXCEPTION — proposal §7.
   *
   * Rule 3 is no longer clean here, and reporting a clean tree would be the self-deception
   * this file exists to prevent. There IS a write-through: `unit` create / update / archive,
   * `unit_relation` attach / detach, and `unit_app_access` on / off, through Passport's **org
   * API** with the acting person's own token.
   *
   * So the assertion is not "no writes" but **"only those, and only through that door"** —
   * which makes the boundary enforceable rather than a paragraph in a document. A method
   * added to the client fails these, which forces the exception to be re-argued instead of
   * quietly widened.
   */
  describe('§0d — the documented exception is BOUNDED', () => {
    const CLIENT = 'packages/server/src/passport/structure-write.ts'
    const client = () => ALL_FILES.find((f) => f.path === CLIENT)

    it('the write-through exists and is confined to one file', () => {
      // Asserted to be PRESENT for the same reason as the block below: a sweeper removing
      // "writes to Passport" would take the feature out, not fix a leak.
      expect(client(), 'the structure write client was moved or deleted').toBeDefined()
      // Every other file reaches Passport's write door through it, so `/orgs/` write paths
      // appear in exactly one place.
      const others = hits(/api\/v1\/orgs\/\$\{[^}]*\}\/(units|unit-relations)/, [CLIENT])
      expect(others, 'a second file is writing structure to Passport directly').toEqual([])
    })

    it('touches none of the five aggregates that stay closed', () => {
      // membership, entitlement, unit_app_membership, identity_link and organization are
      // still rule 3 in full: edited in the console, arriving here by sync only.
      const text = client()?.text ?? ''
      for (const closed of [
        'memberships',
        'entitlements',
        'unit-app-membership',
        'identity-links',
      ]) {
        expect(text.includes(`/${closed}`), `${closed} is CLOSED — no consumer write`).toBe(false)
      }
    })

    it('sends the person’s token and never the app’s API key', () => {
      // If the app's own credential could change structure, every consumer holding a key
      // becomes a way to edit an org's structure, and Passport's audit trail names
      // BrandFactory rather than the person.
      const text = client()?.text ?? ''
      expect(text).toMatch(/authorization: `Bearer \$\{person\.token\}`/)
      expect(text).not.toMatch(/['"`]?[xX]-[aA][pP][iI]-[kK]ey['"`]?\s*:/)
      expect(text).not.toMatch(/PASSPORT_API_KEY/)
    })

    it('never sends `description`, which Passport accepts and never syncs back', () => {
      // The trap: it is accepted, so it looks supported. Writing it creates a copy this app
      // can never read, which presents as a save that silently did nothing.
      const text = stripComments(client()?.text ?? '')
      expect(text).not.toMatch(/\bdescription\b/)
    })
  })

  // §0e is covered by `packages/web/src/auth/signout-scope.test.ts`, which sweeps every
  // GoTrue sign-out call site. Asserted to EXIST rather than duplicated here, because a
  // deleted guard is the failure this would otherwise miss.
  it('§0e — the sign-out scope guard is still present', () => {
    const guard = ALL_FILES.find((f) => f.path === 'packages/web/src/auth/signout-scope.test.ts')
    expect(guard, 'the sign-out sweep was deleted').toBeDefined()
    expect(guard!.text).toMatch(/scope/)
  })

  // The mirror-image failure. Rule 3 is proven by absence, so the instinct when sweeping
  // is to delete everything that talks to Passport — and these four are reads and
  // redemptions, not writes. Removing any of them takes login or placement down.
  describe('the sweep did not OVER-close', () => {
    const present = (pattern: RegExp) => ALL_FILES.some((f) => pattern.test(f.text))

    it('still redeems the hosted-login handoff', () => {
      // `session-exchange` redeems an `auth_handoff_code`, which is NOT one of the eight
      // aggregates — a code redemption, not a write-back. Hosted login stops working
      // without it.
      expect(present(/apps\/me\/session-exchange/)).toBe(true)
    })

    it('still reads the app registry, which is where placement comes from', () => {
      // Not a synced aggregate: no event announces a change and `snapshot()` does not
      // carry it, so this read is the only source of `unit_scopes` / `role_cascade`.
      expect(present(/apps\/me\/registry/)).toBe(true)
    })

    it('still reads the snapshot for reconciliation', () => {
      expect(present(/\.snapshot\(\)/)).toBe(true)
    })

    it('still verifies tokens against Passport’s project', () => {
      expect(present(/verifyPassportToken/)).toBe(true)
    })

    it('still derives access through the SDK helper rather than a hand-rolled join', () => {
      expect(present(/rolesAtUnits\(/)).toBe(true)
      expect(present(/hasAppAccess\(/)).toBe(true)
    })
  })
})
