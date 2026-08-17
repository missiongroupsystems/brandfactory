import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import {
  createStructureWriteClient,
  extractDetail,
  isRetryable,
  structureWriteMessage,
  type ActingPerson,
} from './structure-write'

/**
 * The org-API client — the documented rule 3 exception.
 *
 * Proposal §7; plan phase 9a.
 *
 * ## What these tests are for
 *
 * Three properties, and none of them is visible in a passing happy path:
 *
 * 1. **An app-native token is never forwarded**, and the refusal happens BEFORE the request.
 * 2. **`403` and `404` are indistinguishable**, because Passport made them so on purpose.
 * 3. **`X-API-Key` is never sent**, and `type` / `description` never reach a body.
 */

function env(over: Partial<Env> = {}): Env {
  return {
    PASSPORT_API_URL: 'https://passport-api.test',
    PASSPORT_API_KEY: 'app-key-must-not-be-sent',
    PASSPORT_APP_ID: 'app-uuid',
    ...over,
  } as Env
}

const PASSPORT_PERSON: ActingPerson = { token: 'passport-token', issuer: 'passport' }
const APP_NATIVE_PERSON: ActingPerson = { token: 'own-token', issuer: 'app-native' }

const fetchMock = vi.fn()

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return {
    url,
    method: init.method,
    headers: (init.headers ?? {}) as Record<string, string>,
    body:
      init.body === undefined
        ? undefined
        : (JSON.parse(String(init.body)) as Record<string, unknown>),
  }
}

describe('the structure write client', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(
      ok({ id: 'unit-1', organization_id: 'org-1', name: 'A', type: 'brand' }),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── The issuer gate ────────────────────────────────────────────────────────

  it('refuses an app-native token BEFORE issuing a request', async () => {
    const client = createStructureWriteClient(env())
    const result = await client.createUnit(APP_NATIVE_PERSON, 'org-1', { name: 'A', type: 'brand' })

    expect(result).toEqual({ ok: false, error: { kind: 'wrong-issuer' } })
    // The point of "before": Passport would answer `401`, which forwarded to the browser
    // reads as "your session expired" and sends the person round a sign-in loop that cannot
    // fix it. No request means no `401` to misread.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses an app-native token on EVERY method, not just create', async () => {
    const client = createStructureWriteClient(env())
    const calls = [
      () => client.updateUnit(APP_NATIVE_PERSON, 'org-1', 'u1', { name: 'B' }),
      () => client.archiveUnit(APP_NATIVE_PERSON, 'org-1', 'u1'),
      () =>
        client.attachRelation(APP_NATIVE_PERSON, 'org-1', {
          from_unit_id: 'u1',
          to_unit_id: 'u2',
          relation: 'belongs_to_brand',
        }),
      () => client.detachRelation(APP_NATIVE_PERSON, 'org-1', 'r1'),
      () => client.enableApp(APP_NATIVE_PERSON, 'org-1', 'u1'),
      () => client.disableApp(APP_NATIVE_PERSON, 'org-1', 'u1'),
    ]
    for (const call of calls) {
      expect(await call()).toEqual({ ok: false, error: { kind: 'wrong-issuer' } })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks the issuer BEFORE the configuration', async () => {
    // An app-native Admin on a fully configured deployment must be told about their session,
    // not about the server's. The issuer is a property of the caller; configuration is not.
    const client = createStructureWriteClient(env({ PASSPORT_API_URL: undefined }))
    const result = await client.createUnit(APP_NATIVE_PERSON, 'org-1', { name: 'A', type: 'brand' })
    expect(result).toEqual({ ok: false, error: { kind: 'wrong-issuer' } })
  })

  it('reports an unconfigured deployment as such', async () => {
    const client = createStructureWriteClient(env({ PASSPORT_API_URL: undefined }))
    const result = await client.createUnit(PASSPORT_PERSON, 'org-1', { name: 'A', type: 'brand' })
    expect(result).toEqual({ ok: false, error: { kind: 'not-configured' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // ── The credential ─────────────────────────────────────────────────────────

  it('sends the PERSON’s token and never the app’s API key', async () => {
    const client = createStructureWriteClient(env())
    await client.createUnit(PASSPORT_PERSON, 'org-1', { name: 'A', type: 'brand' })

    const req = lastRequest()
    expect(req.headers.authorization).toBe('Bearer passport-token')
    // If the app's own key could change structure, the audit trail in Passport would name
    // BrandFactory rather than the person — and every consumer app holding a key would
    // become a way to edit an org's structure.
    const names = Object.keys(req.headers).map((k) => k.toLowerCase())
    expect(names).not.toContain('x-api-key')
    expect(JSON.stringify(req.headers)).not.toContain('app-key-must-not-be-sent')
  })

  it('strips a trailing slash from the base URL', async () => {
    // `.../` plus `/api/v1` is `//api/v1/...` and a flat 404 that looks nothing like a
    // configuration error.
    const client = createStructureWriteClient(
      env({ PASSPORT_API_URL: 'https://passport-api.test/' }),
    )
    await client.createUnit(PASSPORT_PERSON, 'org-1', { name: 'A', type: 'brand' })
    expect(lastRequest().url).toBe('https://passport-api.test/api/v1/orgs/org-1/units')
  })

  // ── The bodies ─────────────────────────────────────────────────────────────

  it('sends type on a create', async () => {
    const client = createStructureWriteClient(env())
    await client.createUnit(PASSPORT_PERSON, 'org-1', { name: 'Acme', type: 'outlet' })
    expect(lastRequest().body).toEqual({ name: 'Acme', type: 'outlet' })
  })

  it('never sends type on an update, even when handed one', async () => {
    // `UnitUpdate` is `extra="forbid"`, so `type` is a `422` even when the value is
    // unchanged — the shape that makes "I only renamed it" fail.
    const client = createStructureWriteClient(env())
    await client.updateUnit(PASSPORT_PERSON, 'org-1', 'u1', {
      name: 'Renamed',
      ...({ type: 'brand' } as object),
    })
    expect(lastRequest().body).toEqual({ name: 'Renamed' })
  })

  it('never sends description, on any body', async () => {
    // Passport ACCEPTS `description` and deliberately never syncs it back, so writing it
    // creates a copy this app can never read — a save that silently did nothing.
    const client = createStructureWriteClient(env())
    const forbidden = { description: 'nope' } as object

    await client.createUnit(PASSPORT_PERSON, 'org-1', { name: 'A', type: 'brand', ...forbidden })
    expect(Object.keys(lastRequest().body ?? {})).toEqual(['name', 'type'])

    await client.updateUnit(PASSPORT_PERSON, 'org-1', 'u1', { name: 'B', ...forbidden })
    expect(Object.keys(lastRequest().body ?? {})).toEqual(['name'])
  })

  it('sends external_ref on a CREATE, because it is the only key we control', async () => {
    // `UnitCreate.id` is super-admin gated, so this app cannot choose the unit's UUID.
    // `external_ref` is the only place our identifier travels, and it is what the returning
    // `unit.upserted` links a waiting local brand on (`passport/link-brand.ts`).
    const client = createStructureWriteClient(env())
    await client.createUnit(PASSPORT_PERSON, 'org-1', {
      name: 'A',
      type: 'brand',
      externalRef: 'brandfactory:b-1',
    })
    expect(lastRequest().body).toEqual({
      name: 'A',
      type: 'brand',
      external_ref: 'brandfactory:b-1',
    })
  })

  it('NEVER sends external_ref on an update, even when handed one', async () => {
    // Set once, at creation. Changing it later orphans a local brand from its own unit, with
    // nothing failing — the link simply stops resolving. `UnitUpdate` is `extra="forbid"`
    // besides, so it would be a 422.
    const client = createStructureWriteClient(env())
    await client.updateUnit(PASSPORT_PERSON, 'org-1', 'u1', {
      name: 'B',
      ...({ externalRef: 'brandfactory:b-1', external_ref: 'brandfactory:b-1' } as object),
    })
    expect(lastRequest().body).toEqual({ name: 'B' })
  })

  it('omits an absent field rather than sending null', async () => {
    // A `null` name would be a `422`; an absent one is "leave it alone".
    const client = createStructureWriteClient(env())
    await client.updateUnit(PASSPORT_PERSON, 'org-1', 'u1', { profile: { address: 'x' } })
    expect(lastRequest().body).toEqual({ profile: { address: 'x' } })
  })

  it('uses the app id from configuration on the app-access routes', async () => {
    const client = createStructureWriteClient(env())
    await client.enableApp(PASSPORT_PERSON, 'org-1', 'u1')
    expect(lastRequest()).toMatchObject({
      method: 'PUT',
      url: 'https://passport-api.test/api/v1/orgs/org-1/units/u1/apps/app-uuid',
    })
    await client.disableApp(PASSPORT_PERSON, 'org-1', 'u1')
    expect(lastRequest().method).toBe('DELETE')
  })

  // ── The status mapping ─────────────────────────────────────────────────────

  it('maps 403 and 404 to the SAME failure, disclosing nothing', async () => {
    const client = createStructureWriteClient(env())

    fetchMock.mockResolvedValue(new Response('{"detail":"Not an admin"}', { status: 403 }))
    const forbidden = await client.archiveUnit(PASSPORT_PERSON, 'org-1', 'u1')

    fetchMock.mockResolvedValue(
      new Response('{"detail":"Organization not found"}', { status: 404 }),
    )
    const missing = await client.archiveUnit(PASSPORT_PERSON, 'org-1', 'u1')

    // Passport answers `404` to an outsider precisely so that "this org exists and you are
    // not an Admin" is indistinguishable from "no such org". Splitting them here would
    // rebuild the disclosure it went out of its way to prevent.
    expect(forbidden).toEqual(missing)
    expect(forbidden).toEqual({ ok: false, error: { kind: 'forbidden' } })
    // And neither leaks Passport's own wording, which does distinguish them.
    expect(structureWriteMessage({ kind: 'forbidden' })).not.toMatch(/not found/i)
  })

  it('maps 422 to the field-level message, so a form bug is fixable', async () => {
    const client = createStructureWriteClient(env())
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [{ loc: ['body', 'profile', 'uen'], msg: 'not allowed for brand' }],
        }),
        { status: 422 },
      ),
    )
    const result = await client.updateUnit(PASSPORT_PERSON, 'org-1', 'u1', { name: 'A' })
    expect(result).toEqual({
      ok: false,
      error: { kind: 'invalid', message: 'uen: not allowed for brand' },
    })
  })

  it('maps 409 to a conflict, carrying Passport’s own wording', async () => {
    const client = createStructureWriteClient(env())
    fetchMock.mockResolvedValue(
      new Response('{"detail":"external_ref already used"}', { status: 409 }),
    )
    const result = await client.createUnit(PASSPORT_PERSON, 'org-1', { name: 'A', type: 'brand' })
    expect(result).toEqual({
      ok: false,
      error: { kind: 'conflict', message: 'external_ref already used' },
    })
  })

  it('maps 401 to an expired session rather than to wrong-issuer', async () => {
    // The issuer was right — it is the token that is dead. Reporting `wrong-issuer` here
    // would tell a Passport user to sign in with Passport, which is what they just did.
    const client = createStructureWriteClient(env())
    fetchMock.mockResolvedValue(new Response('{"detail":"Invalid token"}', { status: 401 }))
    const result = await client.archiveUnit(PASSPORT_PERSON, 'org-1', 'u1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid')
    expect(structureWriteMessage(result.error)).toMatch(/expired/i)
  })

  it('maps a 5xx and a thrown request to unavailable', async () => {
    const client = createStructureWriteClient(env())

    fetchMock.mockResolvedValue(new Response('gateway', { status: 502 }))
    const fiveHundred = await client.archiveUnit(PASSPORT_PERSON, 'org-1', 'u1')
    expect(fiveHundred.ok).toBe(false)
    if (!fiveHundred.ok) expect(fiveHundred.error.kind).toBe('unavailable')

    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const thrown = await client.archiveUnit(PASSPORT_PERSON, 'org-1', 'u1')
    expect(thrown.ok).toBe(false)
    if (!thrown.ok) expect(thrown.error.kind).toBe('unavailable')
  })

  it('reads a 204 as success with no body', async () => {
    const client = createStructureWriteClient(env())
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    expect(await client.detachRelation(PASSPORT_PERSON, 'org-1', 'r1')).toEqual({
      ok: true,
      value: null,
    })
  })
})

describe('isRetryable', () => {
  it('is true for unavailable and false for everything else', () => {
    // ONLY `unavailable`. A `403` refuses again and a `422` fails identically until the
    // input changes, so queueing either produces a retry button that can never succeed —
    // which reads as "the system will get there eventually" when nothing will.
    expect(isRetryable({ kind: 'unavailable', message: 'x' })).toBe(true)
    expect(isRetryable({ kind: 'forbidden' })).toBe(false)
    expect(isRetryable({ kind: 'invalid', message: 'x' })).toBe(false)
    expect(isRetryable({ kind: 'conflict', message: 'x' })).toBe(false)
    expect(isRetryable({ kind: 'wrong-issuer' })).toBe(false)
    expect(isRetryable({ kind: 'not-configured' })).toBe(false)
  })
})

describe('extractDetail', () => {
  it('reads FastAPI’s string detail', () => {
    expect(extractDetail('{"detail":"plain"}')).toBe('plain')
  })

  it('reads FastAPI’s validation array, naming the field', () => {
    // A `422` rendered as `[object Object]` is the failure reported as "it just says an
    // error", and both shapes appear on these routes.
    expect(
      extractDetail(JSON.stringify({ detail: [{ loc: ['body', 'name'], msg: 'too short' }] })),
    ).toBe('name: too short')
  })

  it('joins more than one validation issue', () => {
    expect(
      extractDetail(
        JSON.stringify({
          detail: [
            { loc: ['body', 'name'], msg: 'too short' },
            { loc: ['body', 'type'], msg: 'not permitted' },
          ],
        }),
      ),
    ).toBe('name: too short; type: not permitted')
  })

  it('returns null rather than throwing on a body that is not JSON', () => {
    // An HTML error page from a proxy in front of Passport. The caller falls back to its own
    // wording, which is better than a crash inside error handling.
    expect(extractDetail('<html>502</html>')).toBeNull()
    expect(extractDetail('')).toBeNull()
    expect(extractDetail('{"error":"other shape"}')).toBeNull()
  })
})

describe('structureWriteMessage', () => {
  it('tells an app-native Admin what is actually wrong', () => {
    // Not "you lack permission" — they may well be an Owner. The problem is the session.
    const msg = structureWriteMessage({ kind: 'wrong-issuer' })
    expect(msg).toMatch(/Passport/)
    expect(msg).not.toMatch(/permission|Owner or Admin/)
  })

  it('names the org role vocabulary verbatim for a refusal', () => {
    // `Owner`/`Admin` are Passport's words (rule 8), and the message uses them so that what
    // the person reads matches what they see in the Passport console.
    expect(structureWriteMessage({ kind: 'forbidden' })).toMatch(/Owner or Admin/)
  })

  it('says structure is temporarily read-only on an outage, and that it is kept', () => {
    const msg = structureWriteMessage({ kind: 'unavailable', message: 'timeout' })
    expect(msg).toMatch(/unavailable/i)
    expect(msg).toMatch(/retried/i)
  })
})
