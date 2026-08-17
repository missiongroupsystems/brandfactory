import type { Env } from '../env'

/**
 * Writes to Passport's **org API** — the documented rule 3 exception.
 *
 * Proposal: `docs/executing/passport-sync-consumer-proposal.md` §7 (the decision record).
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 9a.
 *
 * ---------------------------------------------------------------------------
 * This is a SECOND door, and using the first one would fail flatly
 * ---------------------------------------------------------------------------
 *
 * `PassportClient` — the SDK this app already depends on — carries `X-API-Key` and has
 * **no unit routes at all**. Passport's App API is deliberately read-only about structure.
 * So none of the calls below can be made through it, and reaching for it produces a `404`
 * that reads like a wrong path rather than a wrong door.
 *
 * The org API is the other door: `Authorization: Bearer <the acting PERSON's Passport
 * access token>`, checked by Passport's `require_org_access` (Owner or Admin). **No
 * `X-API-Key` is sent** — the app's own credential must not be able to change structure,
 * because then the audit trail names BrandFactory rather than the person, and every
 * consumer app holding a key becomes a way to edit an org's structure.
 *
 * ---------------------------------------------------------------------------
 * Only a Passport-issued token may be forwarded, and this refuses BEFORE the request
 * ---------------------------------------------------------------------------
 *
 * An app-native session's token is signed by BrandFactory's own Supabase project.
 * Passport would reject it — but as a `401`, which forwarded to the browser reads as "your
 * session expired" and sends the person round the sign-in loop that cannot fix it. So the
 * issuer is checked here first and the refusal names the reason.
 *
 * ---------------------------------------------------------------------------
 * The scope is a BOUNDARY, not a starting point
 * ---------------------------------------------------------------------------
 *
 * `unit` create / update / archive, `unit_relation` attach / detach, and
 * `unit_app_access` on / off. **Nothing else.** No membership, no entitlement, no
 * `unit_app_membership`, no `identity_link`. Those remain rule 3: they are edited in the
 * Passport console and arrive here by sync. Adding a method to this file is not an
 * extension of an existing exception — it is a new one, and it needs its own decision
 * record.
 */

/** The three unit types. `type` is immutable in Passport, so it exists on create only. */
export type UnitType = 'entity' | 'brand' | 'outlet'

/**
 * The relations Passport recognises. Which are legal depends on the originating unit's
 * type, and Passport answers `422` for an illegal pairing.
 */
export type UnitRelationKind = 'owned_by_entity' | 'belongs_to_brand' | 'operated_by_entity'

/**
 * The profile fields, by the type that may carry them.
 *
 * **A brand carries none.** A brand is a concept, not a place or a legal person, so it has
 * no address and no tax registration. Sending one is a `422`, and the form must not offer
 * it — a field that cannot be saved is worse than an absent one.
 */
export interface EntityProfile {
  uen?: string
  gst_reg_no?: string
  registered_address?: string
}

export interface OutletProfile {
  address?: string
  postal?: string
  contact_phone?: string
  kind?: string
}

export type UnitProfile = EntityProfile | OutletProfile

export interface CreateUnitInput {
  name: string
  type: UnitType
  profile?: UnitProfile
  /**
   * Our own key for this unit, set **on create only**.
   *
   * `UnitCreate.id` is super-admin gated, so this app cannot choose the unit's UUID.
   * `external_ref` is the only place our identifier can travel — which is what makes the
   * `D1-b` link possible at all (`passport/link-brand.ts`).
   *
   * The convention is `"<app>:<legacy pk>"`, so `brandfactory:<brands.id>`. The prefix earns
   * its bytes: an operator reading a unit in the Passport console can tell which consumer
   * created it, and an unmatched ref is attributable rather than anonymous.
   *
   * **Settable on create, never on update** — see `updateUnit` below.
   */
  externalRef?: string
}

export interface UpdateUnitInput {
  name?: string
  profile?: UnitProfile
}

export interface UnitConsoleRead {
  id: string
  organization_id: string
  name: string
  type: UnitType
  status?: string
  external_ref?: string | null
}

export interface UnitRelationRead {
  id: string
  from_unit_id: string
  to_unit_id: string
  relation: UnitRelationKind
}

/**
 * Every way a structure write can fail, as a closed set.
 *
 * Passport's statuses each mean something different and collapsing them loses the only
 * information the person can act on. The mapping is in `classify` below.
 */
export type StructureWriteFailure =
  | { kind: 'wrong-issuer' }
  | { kind: 'not-configured' }
  | { kind: 'forbidden' }
  | { kind: 'invalid'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'unavailable'; message: string }

export type StructureWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: StructureWriteFailure }

/** What the caller must prove about the acting person before anything is sent. */
export interface ActingPerson {
  /** The RAW bearer token from the incoming request, forwarded verbatim. */
  token: string
  /** Which project signed it. Only `passport` may be forwarded. */
  issuer: 'app-native' | 'passport'
}

export interface StructureWriteClient {
  createUnit(
    person: ActingPerson,
    orgId: string,
    input: CreateUnitInput,
  ): Promise<StructureWriteResult<UnitConsoleRead>>
  updateUnit(
    person: ActingPerson,
    orgId: string,
    unitId: string,
    input: UpdateUnitInput,
  ): Promise<StructureWriteResult<UnitConsoleRead>>
  archiveUnit(
    person: ActingPerson,
    orgId: string,
    unitId: string,
  ): Promise<StructureWriteResult<UnitConsoleRead>>
  attachRelation(
    person: ActingPerson,
    orgId: string,
    input: { from_unit_id: string; to_unit_id: string; relation: UnitRelationKind },
  ): Promise<StructureWriteResult<UnitRelationRead>>
  detachRelation(
    person: ActingPerson,
    orgId: string,
    relationId: string,
  ): Promise<StructureWriteResult<null>>
  enableApp(
    person: ActingPerson,
    orgId: string,
    unitId: string,
  ): Promise<StructureWriteResult<null>>
  disableApp(
    person: ActingPerson,
    orgId: string,
    unitId: string,
  ): Promise<StructureWriteResult<null>>
}

/**
 * Human copy per failure, so every surface says the same thing.
 *
 * **`403` and `404` say the SAME sentence, deliberately.** Passport answers `404` to an
 * outsider precisely so that "this org exists and you are not an Admin of it" is
 * indistinguishable from "no such org". Splitting them here would rebuild the disclosure
 * Passport went out of its way to prevent.
 */
export function structureWriteMessage(error: StructureWriteFailure): string {
  switch (error.kind) {
    case 'wrong-issuer':
      return 'Structure changes need a Mission Passport sign-in. Sign out and sign in with your Passport account.'
    case 'not-configured':
      return 'This deployment is not connected to Mission Passport, so structure is read-only here.'
    case 'forbidden':
      return 'Only an organisation Owner or Admin may change structure.'
    case 'invalid':
      return error.message
    case 'conflict':
      return error.message
    case 'unavailable':
      return 'Mission Passport is unavailable, so structure is temporarily read-only. The change is saved and can be retried.'
  }
}

/** A failure that is worth retrying later, as opposed to one the person must fix. */
export function isRetryable(error: StructureWriteFailure): boolean {
  // ONLY `unavailable`. A `403` will refuse again, and a `422` will fail identically until
  // the input changes — queueing either produces a retry button that can never succeed.
  return error.kind === 'unavailable'
}

/**
 * Pull the most useful sentence out of Passport's error body.
 *
 * FastAPI answers `{"detail": ...}`, where `detail` is a string for a hand-raised error and
 * an array of per-field objects for a validation failure. Both shapes appear on the routes
 * below, so both are handled — a `422` rendered as `[object Object]` is the failure that
 * gets reported as "it just says an error".
 */
export function extractDetail(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown }
    const detail = parsed.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const parts = detail
        .map((item) => {
          const it = item as { loc?: unknown[]; msg?: unknown }
          const field = Array.isArray(it.loc) ? it.loc[it.loc.length - 1] : undefined
          const msg = typeof it.msg === 'string' ? it.msg : null
          if (!msg) return null
          return field ? `${String(field)}: ${msg}` : msg
        })
        .filter((p): p is string => p !== null)
      if (parts.length > 0) return parts.join('; ')
    }
    return null
  } catch {
    return null
  }
}

function classify(status: number, body: string): StructureWriteFailure {
  const detail = extractDetail(body)
  // `403` (a Member) and `404` (an outsider, or no such org) collapse ON PURPOSE. See
  // `structureWriteMessage`.
  if (status === 403 || status === 404) return { kind: 'forbidden' }
  if (status === 401) {
    // Passport refused the person's token. Not `wrong-issuer` — that is caught before the
    // request — so this is an expired or revoked Passport session.
    return { kind: 'invalid', message: 'Your Mission Passport session has expired. Sign in again.' }
  }
  if (status === 409) {
    return { kind: 'conflict', message: detail ?? 'That already exists in Mission Passport.' }
  }
  if (status === 422 || status === 400) {
    return { kind: 'invalid', message: detail ?? 'Mission Passport rejected the change.' }
  }
  return { kind: 'unavailable', message: detail ?? `Mission Passport answered ${status}.` }
}

/**
 * `description` is never sent, on any route.
 *
 * Passport **accepts** it and deliberately never syncs it back, so writing it creates a
 * copy this app can never read — which then reads as a save that silently did nothing.
 * The brand's own description stays app-owned. Nothing below references the field; this
 * note exists because "Passport accepts it" is the reason somebody adds it.
 */
export function createStructureWriteClient(env: Env): StructureWriteClient {
  // Trailing slash stripped, as everywhere else in this integration: `.../` plus `/api/v1`
  // yields `//api/v1/...` and a flat `404` that looks nothing like a configuration error.
  const base = env.PASSPORT_API_URL?.replace(/\/+$/, '')
  const appId = env.PASSPORT_APP_ID

  async function send<T>(
    person: ActingPerson,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<StructureWriteResult<T>> {
    // BEFORE the request, and before the configuration check, because the issuer is a
    // property of the caller rather than of the deployment: an app-native Admin on a fully
    // configured deployment must be told about their session, not about the server's.
    if (person.issuer !== 'passport') return { ok: false, error: { kind: 'wrong-issuer' } }
    if (!base || !appId) return { ok: false, error: { kind: 'not-configured' } }

    let res: Response
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: {
          // The PERSON's token. No `X-API-Key` — see the header of this file.
          authorization: `Bearer ${person.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: 'unavailable',
          message: err instanceof Error ? err.message : String(err),
        },
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: classify(res.status, text) }
    }

    // `204` on the deletes, and `PUT`/`DELETE` of app access. `T` is `null` there.
    if (res.status === 204) return { ok: true, value: null as T }
    const parsed = (await res.json().catch(() => null)) as T | null
    return { ok: true, value: parsed as T }
  }

  return {
    createUnit: (person, orgId, input) =>
      send<UnitConsoleRead>(person, 'POST', `/api/v1/orgs/${orgId}/units`, {
        name: input.name,
        type: input.type,
        ...(input.externalRef ? { external_ref: input.externalRef } : {}),
        ...(input.profile ? { profile: input.profile } : {}),
      }),

    // **`type` is absent, and that is not an omission.** `UnitUpdate` is `extra="forbid"`,
    // so sending it is a `422` even when the value is unchanged — and a brand cannot become
    // an outlet in any case.
    //
    // **`external_ref` is absent for a different reason, and it is `D1-b`-critical.** It is
    // set once, at creation, to `brandfactory:<brands.id>`, and the link between a local
    // brand and its unit resolves through it. Changing it after the fact would orphan the
    // brand from its own unit with nothing failing.
    updateUnit: (person, orgId, unitId, input) =>
      send<UnitConsoleRead>(person, 'PATCH', `/api/v1/orgs/${orgId}/units/${unitId}`, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.profile === undefined ? {} : { profile: input.profile }),
      }),

    archiveUnit: (person, orgId, unitId) =>
      send<UnitConsoleRead>(person, 'POST', `/api/v1/orgs/${orgId}/units/${unitId}/archive`),

    attachRelation: (person, orgId, input) =>
      send<UnitRelationRead>(person, 'POST', `/api/v1/orgs/${orgId}/unit-relations`, input),

    // Relations are IMMUTABLE, so re-parenting is a detach then an attach. This is a
    // destructive write to structure that sibling apps read, which is why the route layer
    // gives it its own confirmation and never applies it automatically to resolve a `409`.
    detachRelation: (person, orgId, relationId) =>
      send<null>(person, 'DELETE', `/api/v1/orgs/${orgId}/unit-relations/${relationId}`),

    enableApp: (person, orgId, unitId) =>
      send<null>(person, 'PUT', `/api/v1/orgs/${orgId}/units/${unitId}/apps/${appId}`),

    disableApp: (person, orgId, unitId) =>
      send<null>(person, 'DELETE', `/api/v1/orgs/${orgId}/units/${unitId}/apps/${appId}`),
  }
}
