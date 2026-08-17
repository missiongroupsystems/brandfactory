#!/usr/bin/env node
/**
 * Has the Passport TypeScript SDK changed since the commit we pin?
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 10.
 *
 * ---------------------------------------------------------------------------
 * Why this exists instead of Renovate
 * ---------------------------------------------------------------------------
 *
 * The obvious move is `renovate.json` extending
 * `local>missiongroupsystems/passport//renovate/passport-consumer`. **That would be
 * automation theatre here**, and it fails on three independent counts — each verified,
 * not assumed:
 *
 *  1. The preset's custom manager matches `pyproject.toml`. BrandFactory has none.
 *  2. It resolves `passport-client-v*` **git tags**. The newest such tag is
 *     `passport-client-v1.1.0`, which predates `roles_at_units` (SDK 2.0.0) and
 *     `unit_scopes` / `role_cascade` (2.2.0) — so pinning a tag would pin an SDK whose
 *     access helper this app cannot call.
 *  3. At that tag `packages/passport-client/` contains **only `python`**. The TypeScript
 *     SDK did not exist, and its 3.0.0 has never been tagged at all.
 *
 * So there is nothing for Renovate to compare against, and a config that silently
 * matches nothing is worse than no config: it looks like the dependency is being
 * watched. This script watches the thing that actually moves — the SDK's source at the
 * commit we pinned.
 *
 * **Switch to Renovate the day the TypeScript package gets its own tags**
 * (`passport-client-ts-v*` or similar). Then the pin becomes a tag, the preset's
 * `fileMatch` needs widening to `package.json`, and this script can go.
 *
 * ---------------------------------------------------------------------------
 * It WARNS rather than fails, deliberately
 * ---------------------------------------------------------------------------
 *
 * An upstream commit we have not adopted is not a defect in the pull request being
 * tested, and failing on it would block unrelated work until somebody bumps the pin.
 * The warning is emitted as a GitHub Actions annotation so it appears on the PR rather
 * than only in a log nobody opens.
 *
 * It exits 0 for "cannot tell" too — no token, no network, an API hiccup. A version
 * check that fails the build when it cannot reach the internet is a check that gets
 * deleted.
 */

import { readFileSync } from 'node:fs'

const REPO = 'missiongroupsystems/passport'
const SDK_PATH = 'packages/passport-client/typescript'
const PACKAGE_JSON = 'packages/server/package.json'
const DEP = '@missiongroupsystems/passport-client'

const onCI = Boolean(process.env.GITHUB_ACTIONS)

/** A GitHub Actions annotation on CI, a plain line locally. */
function warn(message) {
  console.log(onCI ? `::warning title=Passport SDK pin::${message}` : `WARNING: ${message}`)
}

function info(message) {
  console.log(message)
}

function readPinnedSha() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
  const spec = pkg.dependencies?.[DEP]
  if (!spec) {
    // Not an error: the dependency may legitimately be gone one day.
    info(`${DEP} is not a dependency of ${PACKAGE_JSON} — nothing to check.`)
    return null
  }
  // `git+https://…/passport.git#<sha>&path:/packages/passport-client/typescript`
  const match = /#([0-9a-f]{7,40})/i.exec(spec)
  if (!match) {
    warn(
      `could not read a commit SHA out of the ${DEP} specifier. If the pin has moved to ` +
        `a tag, this script is obsolete — see its header and switch to Renovate.`,
    )
    return null
  }
  return match[1]
}

async function main() {
  const pinned = readPinnedSha()
  if (!pinned) return

  const token = process.env.PASSPORT_REPO_TOKEN ?? process.env.GITHUB_TOKEN
  if (!token) {
    // The repo is private, so an unauthenticated call answers 404 and would read as
    // "deleted" rather than "unauthorised". Say which it is.
    info(
      'PASSPORT_REPO_TOKEN is not set — skipping the SDK drift check. ' +
        `(${REPO} is private, so an unauthenticated read cannot tell "no changes" from ` +
        '"no access".)',
    )
    return
  }

  const url = `https://api.github.com/repos/${REPO}/compare/${pinned}...main`
  let body
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      info(`SDK drift check skipped: GitHub answered ${res.status}.`)
      return
    }
    body = await res.json()
  } catch (err) {
    info(`SDK drift check skipped: ${err.message}`)
    return
  }

  if (body.status === 'identical') {
    info(`Passport SDK pin is current (${pinned.slice(0, 7)} = main).`)
    return
  }

  // `files` is truncated past 300 entries, which is fine for a warning: a diff that
  // large has certainly touched the SDK if it touched it at all.
  const touched = (body.files ?? []).filter((f) => f.filename?.startsWith(SDK_PATH))

  if (touched.length === 0) {
    info(
      `Passport SDK pin is behind main by ${body.behind_by ?? '?'} commit(s), but none ` +
        `of them touch ${SDK_PATH}. Nothing to adopt.`,
    )
    return
  }

  warn(
    `${SDK_PATH} has changed in ${touched.length} file(s) since the pinned commit ` +
      `${pinned.slice(0, 7)}. Re-read the SDK source before bumping: a renamed handler ` +
      `or payload field fails SILENTLY (unknown event types no-op, unknown payload keys ` +
      `are stripped), so a half-adopted change looks healthy while projecting nothing. ` +
      `Changed: ${touched
        .slice(0, 8)
        .map((f) => f.filename.replace(`${SDK_PATH}/`, ''))
        .join(', ')}`,
  )
}

await main()
