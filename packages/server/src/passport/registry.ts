import type { UnitType } from '@missiongroupsystems/passport-client'
import type { Env } from '../env'
import type { Logger } from '../logger'

/**
 * Step 0 — this app's PLACEMENT, read from Passport's registry.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 4a.
 *
 * ```
 * GET {PASSPORT_API_URL}/api/v1/apps/me/registry     header: X-API-Key
 * -> { unit_scopes: UnitType[], role_cascade: boolean, unit_scope: …|null, id, key, … }
 * ```
 *
 * ---------------------------------------------------------------------------
 * Read `unit_scopes` (plural). NEVER the deprecated `unit_scope`.
 * ---------------------------------------------------------------------------
 *
 * The response carries both. The singular field is **derived**, it can name only
 * five of the seven possible combinations, and it is **`null`** for the rest —
 * `{entity, brand}`, all three types, and either dual shape without a cascade.
 *
 * **BrandFactory's registered shape is one of the `null` cases**, confirmed against
 * the live registry on 2026-08-17: `unit_scopes: ["entity","brand","outlet"]` with
 * `unit_scope: null`. So a reader that took placement from the singular field would
 * read `null`, fall back to the documented `["brand"]` default, and silently narrow
 * this app to brands — a **silent under-permission with no error to catch**. `null`
 * is the right answer for the one thing the SDKs read that field for (the cascade
 * lookup, since no such shape cascades) and the wrong answer for anything reading
 * placement. It is destructured away below so nothing can drift back onto it.
 *
 * ---------------------------------------------------------------------------
 * Placement and cascade are SEPARATE facts. Do not infer either from the other.
 * ---------------------------------------------------------------------------
 *
 * Living at two levels no longer implies inheriting between them: `{brand, outlet}`
 * with `role_cascade` false is legal and newly expressible, and inferring the
 * cascade from the shape over-permits it.
 *
 * In the other direction, Passport permits `role_cascade: true` **only** on exactly
 * `{entity, outlet}` or `{brand, outlet}` and answers `422` otherwise
 * (`backend/app/domain/unit_scope.py::cascade_relation`). So on this app's
 * three-type placement the cascade is necessarily **false** — not merely off by
 * configuration, but unavailable. Every unit needs its own role row, or the person
 * must be an org `Owner`/`Admin` and hold `Manager` everywhere by the ladder.
 *
 * ---------------------------------------------------------------------------
 * Read ONCE at startup
 * ---------------------------------------------------------------------------
 *
 * The registry is **not a synced aggregate**: no event announces a change and
 * `snapshot()` does not carry it. So this is read at boot and cached for the
 * process, and a re-scope needs a restart.
 *
 * A narrowing can also strand existing role rows, because Passport validates
 * placement on `INSERT` only. If access answers go wrong immediately after an
 * admin "fixed the scope", restart before debugging anything else.
 *
 * There is deliberately **no `PASSPORT_UNIT_SCOPE` environment variable** —
 * `env.ts` refuses it by name. It would be a local copy of a fact Passport owns,
 * and the wrong placement denies every user with no error anywhere.
 */

export interface PassportPlacement {
  /** Which unit types may hold this app's roles. A SET, not a five-value enum. */
  unitScopes: readonly UnitType[]
  /** Whether a parent's role also applies at the outlets beneath it. */
  roleCascade: boolean
  /** The app's own UUID, as Passport knows it. */
  appId: string
  /** The app's registry key — NOT derivable from the repository name. */
  key: string
  /** True when this came from Passport rather than from the offline fallback. */
  authoritative: boolean
}

const UNIT_TYPES: readonly UnitType[] = ['entity', 'brand', 'outlet']

/**
 * What an unconfigured environment gets: brand-only, no cascade.
 *
 * Local development and CI have no API key, and refusing to boot over that would
 * make Passport a hard dependency for running the app at all. But the fallback is
 * logged as an assumption every time, because the wrong placement dangles every
 * `unit_app_access` row and denies every user silently.
 */
const FALLBACK: Omit<PassportPlacement, 'appId' | 'key'> = {
  unitScopes: ['brand'],
  roleCascade: false,
  authoritative: false,
}

const TIMEOUT_MS = 10_000

let cached: PassportPlacement | null = null

/** Test seam. Never call from a request path. */
export function __resetPassportPlacement(): void {
  cached = null
}

function parse(body: unknown, log?: Logger): Omit<PassportPlacement, 'authoritative'> | null {
  if (typeof body !== 'object' || body === null) return null
  // Destructured by name so `unit_scope` (singular) is not even in scope below.
  const { unit_scopes: scopes, role_cascade: cascade, id, key } = body as Record<string, unknown>

  if (!Array.isArray(scopes) || scopes.length === 0) {
    log?.warn('passport registry: unit_scopes missing or empty', { got: typeof scopes })
    return null
  }
  // Validate rather than trust: an unrecognised type would silently widen what we
  // believe about placement, and it is cheap to refuse.
  const unknown = scopes.filter((s) => !UNIT_TYPES.includes(s as UnitType))
  if (unknown.length > 0) {
    log?.warn('passport registry: unrecognised unit type', { unknown })
    return null
  }
  if (typeof cascade !== 'boolean' || typeof id !== 'string' || typeof key !== 'string') {
    log?.warn('passport registry: role_cascade, id or key has the wrong shape')
    return null
  }
  return { unitScopes: scopes as UnitType[], roleCascade: cascade, appId: id, key }
}

/**
 * Fetch placement, or fall back.
 *
 * Never throws: a registry that is unreachable at boot must not stop the app
 * serving app-native users, and the fallback is loud enough to diagnose.
 */
export async function loadPassportPlacement(
  env: Env,
  log?: Logger,
  fetchImpl: typeof fetch = fetch,
): Promise<PassportPlacement> {
  if (cached) return cached

  const base = env.PASSPORT_API_URL?.replace(/\/+$/, '')
  const apiKey = env.PASSPORT_API_KEY
  const appId = env.PASSPORT_APP_ID

  if (!base || !apiKey) {
    log?.warn(
      'passport placement ASSUMED brand-only: PASSPORT_API_URL / PASSPORT_API_KEY are not set. ' +
        'This is the offline default, not a fact — the wrong placement denies users with no error.',
    )
    cached = { ...FALLBACK, appId: appId ?? '', key: '' }
    return cached
  }

  try {
    // The path is `/apps/me/REGISTRY`. A bare `/apps/me` matches `app_id="me"` on
    // the super-admin `/apps/{app_id}` route and answers 401 — a misleading "bad
    // key" for what is actually a URL mistake.
    //
    // The trailing-slash strip above is load-bearing: `${base}/api/v1/...` over a
    // trailing slash yields `//api/v1/...`, which Passport answers with a flat 404.
    const res = await fetchImpl(`${base}/api/v1/apps/me/registry`, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      log?.warn('passport placement ASSUMED brand-only: registry read failed', {
        status: res.status,
      })
      cached = { ...FALLBACK, appId: appId ?? '', key: '' }
      return cached
    }

    const parsed = parse(await res.json(), log)
    if (!parsed) {
      cached = { ...FALLBACK, appId: appId ?? '', key: '' }
      return cached
    }

    // A mismatch here means the API key and PASSPORT_APP_ID belong to different
    // apps, which would make every derived role row resolve against the wrong app.
    if (appId && appId !== parsed.appId) {
      log?.error('PASSPORT_APP_ID does not match the app this API key authenticates', {
        configured: appId,
        registry: parsed.appId,
      })
    }

    cached = { ...parsed, authoritative: true }
    log?.info('passport placement read from registry', {
      key: parsed.key,
      unitScopes: parsed.unitScopes,
      roleCascade: parsed.roleCascade,
    })
    return cached
  } catch (err) {
    log?.warn('passport placement ASSUMED brand-only: registry read threw', {
      message: (err as Error).message,
    })
    cached = { ...FALLBACK, appId: appId ?? '', key: '' }
    return cached
  }
}

/**
 * The placement already loaded, for callers on the request path.
 *
 * Throws if `loadPassportPlacement` has not run. That is deliberate: the
 * alternative is a request-path fetch, and reading placement per request is both
 * wasteful and a way for the answer to change mid-session.
 */
export function passportPlacement(): PassportPlacement {
  if (!cached) {
    throw new Error(
      'Passport placement has not been loaded. Call loadPassportPlacement() at startup — ' +
        'it is read once per process because no event announces a change.',
    )
  }
  return cached
}
