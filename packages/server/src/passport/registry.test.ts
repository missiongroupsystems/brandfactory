import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { createLogger, type Logger } from '../logger'
import { __resetPassportPlacement, loadPassportPlacement, passportPlacement } from './registry'

/**
 * Step 0 — reading placement from the registry.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 4a.
 *
 * The response shape here is not invented: it is the real body returned by
 * `GET /api/v1/apps/me/registry` for this app on 2026-08-17.
 */

const LIVE_RESPONSE = {
  unit_scopes: ['entity', 'brand', 'outlet'],
  role_cascade: false,
  id: 'cddc45e1-8f19-4898-b3c8-33d34a985390',
  key: 'marketingbase',
  name: 'Marketing Base',
  description: 'One brand context. Endless consistent creative.',
  logo_url: 'https://example.test/logo.svg',
  status: 'active',
  // DERIVED and deprecated. `null` for this app's shape — see the trap below.
  unit_scope: null,
}

function env(over: Partial<Env> = {}): Env {
  return {
    PASSPORT_API_URL: 'https://passport-api.test',
    PASSPORT_API_KEY: 'pk_test',
    PASSPORT_APP_ID: LIVE_RESPONSE.id,
    ...over,
  } as Env
}

function captured(): { log: Logger; lines: string[] } {
  const lines: string[] = []
  return {
    lines,
    log: createLogger({ level: 'debug', write: (line) => lines.push(JSON.stringify(line)) }),
  }
}

function fetchOk(body: unknown, url: { value?: string; headers?: Headers } = {}) {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    url.value = String(input)
    url.headers = new Headers(init?.headers)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

describe('passport placement', () => {
  beforeEach(() => {
    __resetPassportPlacement()
  })

  it('reads unit_scopes and role_cascade from the registry', async () => {
    const seen: { value?: string; headers?: Headers } = {}
    const placement = await loadPassportPlacement(env(), undefined, fetchOk(LIVE_RESPONSE, seen))

    expect(placement.unitScopes).toEqual(['entity', 'brand', 'outlet'])
    expect(placement.roleCascade).toBe(false)
    expect(placement.appId).toBe(LIVE_RESPONSE.id)
    expect(placement.authoritative).toBe(true)

    // The path is `/apps/me/REGISTRY`. A bare `/apps/me` matches `app_id="me"` on
    // the super-admin route and answers 401 — a misleading "bad key" for a URL
    // mistake.
    expect(seen.value).toBe('https://passport-api.test/api/v1/apps/me/registry')
    expect(seen.headers?.get('X-API-Key')).toBe('pk_test')
  })

  // THE trap, and it is not hypothetical: the live registry returns
  // `unit_scope: null` for this app, because the deprecated singular field cannot
  // name a three-type shape. A reader that took placement from it would fall back
  // to `["brand"]` and silently narrow the app to brands — an under-permission with
  // no error to catch.
  it('IGNORES the deprecated singular unit_scope, which is null for this app', async () => {
    const placement = await loadPassportPlacement(env(), undefined, fetchOk(LIVE_RESPONSE))

    expect(placement.unitScopes).toEqual(['entity', 'brand', 'outlet'])
    expect(placement.unitScopes).not.toEqual(['brand'])
  })

  it('ignores the singular field even when it contradicts the plural one', async () => {
    // Constructed rather than observed: the point is that `unit_scopes` wins, so a
    // future change to the derived field cannot move our placement.
    const placement = await loadPassportPlacement(
      env(),
      undefined,
      fetchOk({ ...LIVE_RESPONSE, unit_scope: 'brand', unit_scopes: ['outlet'] }),
    )

    expect(placement.unitScopes).toEqual(['outlet'])
  })

  it('reads the cascade as its own fact, not inferred from the shape', async () => {
    // `{brand, outlet}` with the flag OFF is legal and newly expressible. Inferring
    // "two levels means roles flow down" would over-permit it.
    const off = await loadPassportPlacement(
      env(),
      undefined,
      fetchOk({ ...LIVE_RESPONSE, unit_scopes: ['brand', 'outlet'], role_cascade: false }),
    )
    expect(off.roleCascade).toBe(false)

    __resetPassportPlacement()
    const on = await loadPassportPlacement(
      env(),
      undefined,
      fetchOk({ ...LIVE_RESPONSE, unit_scopes: ['brand', 'outlet'], role_cascade: true }),
    )
    expect(on.roleCascade).toBe(true)
  })

  it('strips a trailing slash from the API url', async () => {
    const seen: { value?: string } = {}
    // A trailing slash yields `//api/v1/...`, which Passport answers with a flat
    // 404 — not a redirect, and not a useful error.
    await loadPassportPlacement(
      env({ PASSPORT_API_URL: 'https://passport-api.test/' }),
      undefined,
      fetchOk(LIVE_RESPONSE, seen),
    )
    expect(seen.value).toBe('https://passport-api.test/api/v1/apps/me/registry')
  })

  it('reads once per process and caches, because no event announces a change', async () => {
    const fetchImpl = fetchOk(LIVE_RESPONSE)
    await loadPassportPlacement(env(), undefined, fetchImpl)
    await loadPassportPlacement(env(), undefined, fetchImpl)

    // The registry is not a synced aggregate and `snapshot()` does not carry it, so
    // a re-scope needs a restart. Re-reading per request would be waste, and would
    // let the answer change mid-session.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  describe('the offline fallback', () => {
    it('assumes brand-only when the API is not configured, and says so', async () => {
      const { log, lines } = captured()
      const placement = await loadPassportPlacement(
        env({ PASSPORT_API_URL: undefined, PASSPORT_API_KEY: undefined }),
        log,
      )

      expect(placement.unitScopes).toEqual(['brand'])
      expect(placement.roleCascade).toBe(false)
      // `authoritative: false` is the flag that stops the fallback being mistaken
      // for a fact.
      expect(placement.authoritative).toBe(false)
      expect(lines.join(' ')).toMatch(/ASSUMED brand-only/)
    })

    it('falls back rather than throwing when the registry answers non-2xx', async () => {
      const { log, lines } = captured()
      const fetchImpl = vi.fn(
        async () => new Response('nope', { status: 401 }),
      ) as unknown as typeof fetch

      const placement = await loadPassportPlacement(env(), log, fetchImpl)

      // A registry unreachable at boot must not stop the app serving app-native
      // users — but it must be loud, because the wrong placement denies everyone
      // with no error anywhere.
      expect(placement.authoritative).toBe(false)
      expect(lines.join(' ')).toMatch(/registry read failed/)
    })

    it('falls back when the request throws', async () => {
      const { log, lines } = captured()
      const fetchImpl = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }) as unknown as typeof fetch

      const placement = await loadPassportPlacement(env(), log, fetchImpl)
      expect(placement.authoritative).toBe(false)
      expect(lines.join(' ')).toMatch(/registry read threw/)
    })
  })

  describe('validating the response rather than trusting it', () => {
    it('falls back when unit_scopes is absent or empty', async () => {
      for (const body of [
        { ...LIVE_RESPONSE, unit_scopes: undefined },
        { ...LIVE_RESPONSE, unit_scopes: [] },
      ]) {
        __resetPassportPlacement()
        const placement = await loadPassportPlacement(env(), undefined, fetchOk(body))
        expect(placement.authoritative).toBe(false)
      }
    })

    it('refuses an unrecognised unit type instead of widening placement', async () => {
      const { log, lines } = captured()
      const placement = await loadPassportPlacement(
        env(),
        log,
        fetchOk({ ...LIVE_RESPONSE, unit_scopes: ['brand', 'franchise'] }),
      )

      expect(placement.authoritative).toBe(false)
      expect(lines.join(' ')).toMatch(/unrecognised unit type/)
    })

    it('falls back when role_cascade is not a boolean', async () => {
      const placement = await loadPassportPlacement(
        env(),
        undefined,
        fetchOk({ ...LIVE_RESPONSE, role_cascade: 'true' }),
      )
      expect(placement.authoritative).toBe(false)
    })
  })

  // If these disagree, the API key and the configured app id belong to different
  // apps — so every derived role row would resolve against the wrong app, and
  // `unit_app_access` would never match.
  it('logs an error when PASSPORT_APP_ID does not match the authenticated app', async () => {
    const { log, lines } = captured()
    await loadPassportPlacement(
      env({ PASSPORT_APP_ID: 'some-other-app' }),
      log,
      fetchOk(LIVE_RESPONSE),
    )

    expect(lines.join(' ')).toMatch(/does not match the app this API key authenticates/)
  })

  describe('reading it on the request path', () => {
    it('throws before it has been loaded, rather than fetching per request', () => {
      // The alternative is a request-path fetch, which is both wasteful and a way
      // for the answer to change mid-session.
      expect(() => passportPlacement()).toThrow(/has not been loaded/)
    })

    it('returns the loaded placement afterwards', async () => {
      await loadPassportPlacement(env(), undefined, fetchOk(LIVE_RESPONSE))
      expect(passportPlacement().key).toBe('marketingbase')
    })
  })
})
