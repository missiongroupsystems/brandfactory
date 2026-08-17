import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

const baseLocal = {
  DATABASE_URL: 'postgres://x',
  AUTH_PROVIDER: 'local',
  STORAGE_PROVIDER: 'local-disk',
  REALTIME_PROVIDER: 'native-ws',
  LLM_PROVIDER: 'openrouter',
  LLM_MODEL: 'anthropic/claude-sonnet-4.6',
  BLOB_LOCAL_DISK_ROOT: '/tmp/blobs',
  BLOB_SIGNING_SECRET: 'sec',
  BLOB_PUBLIC_BASE_URL: 'http://localhost:3000/blobs',
  OPENROUTER_API_KEY: 'or_key',
}

describe('loadEnv', () => {
  it('parses a happy local config', () => {
    const env = loadEnv(baseLocal as NodeJS.ProcessEnv)
    expect(env.AUTH_PROVIDER).toBe('local')
    expect(env.STORAGE_PROVIDER).toBe('local-disk')
    expect(env.LLM_PROVIDER).toBe('openrouter')
  })

  it('parses a happy supabase config', () => {
    const env = loadEnv({
      ...baseLocal,
      AUTH_PROVIDER: 'supabase',
      STORAGE_PROVIDER: 'supabase',
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'a_key',
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_JWKS_URL: 'https://supabase.test/.well-known/jwks.json',
      SUPABASE_SERVICE_KEY: 'sk',
      SUPABASE_STORAGE_BUCKET: 'blobs',
      // local-disk vars no longer required:
      BLOB_LOCAL_DISK_ROOT: undefined,
      BLOB_SIGNING_SECRET: undefined,
      BLOB_PUBLIC_BASE_URL: undefined,
      OPENROUTER_API_KEY: undefined,
    } as unknown as NodeJS.ProcessEnv)
    expect(env.AUTH_PROVIDER).toBe('supabase')
    expect(env.LLM_PROVIDER).toBe('anthropic')
  })

  it('rejects supabase auth without a JWKS url', () => {
    expect(() =>
      loadEnv({
        ...baseLocal,
        AUTH_PROVIDER: 'supabase',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/SUPABASE_JWKS_URL/)
  })

  it('rejects local-disk storage without signing secret', () => {
    expect(() =>
      loadEnv({
        ...baseLocal,
        BLOB_SIGNING_SECRET: undefined,
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/BLOB_SIGNING_SECRET/)
  })

  it('rejects anthropic LLM without ANTHROPIC_API_KEY', () => {
    expect(() =>
      loadEnv({
        ...baseLocal,
        LLM_PROVIDER: 'anthropic',
        OPENROUTER_API_KEY: undefined,
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/ANTHROPIC_API_KEY/)
  })

  it('allows ollama with no per-provider key', () => {
    const env = loadEnv({
      ...baseLocal,
      LLM_PROVIDER: 'ollama',
      OPENROUTER_API_KEY: undefined,
    } as unknown as NodeJS.ProcessEnv)
    expect(env.LLM_PROVIDER).toBe('ollama')
  })

  it('rejects supabase storage missing all three required fields', () => {
    let err: Error | undefined
    try {
      loadEnv({
        ...baseLocal,
        STORAGE_PROVIDER: 'supabase',
        BLOB_LOCAL_DISK_ROOT: undefined,
        BLOB_SIGNING_SECRET: undefined,
        BLOB_PUBLIC_BASE_URL: undefined,
      } as unknown as NodeJS.ProcessEnv)
    } catch (e) {
      err = e as Error
    }
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toMatch(/SUPABASE_URL/)
    expect(err?.message).toMatch(/SUPABASE_SERVICE_KEY/)
    expect(err?.message).toMatch(/SUPABASE_STORAGE_BUCKET/)
  })

  it('reports every failure in a single error when multiple conditions are violated', () => {
    let err: Error | undefined
    try {
      loadEnv({
        ...baseLocal,
        AUTH_PROVIDER: 'supabase',
        STORAGE_PROVIDER: 'supabase',
        LLM_PROVIDER: 'anthropic',
        BLOB_LOCAL_DISK_ROOT: undefined,
        BLOB_SIGNING_SECRET: undefined,
        BLOB_PUBLIC_BASE_URL: undefined,
        OPENROUTER_API_KEY: undefined,
      } as unknown as NodeJS.ProcessEnv)
    } catch (e) {
      err = e as Error
    }
    expect(err).toBeInstanceOf(Error)
    // supabase auth + supabase storage + anthropic LLM all missing config:
    expect(err?.message).toMatch(/SUPABASE_JWKS_URL/)
    expect(err?.message).toMatch(/SUPABASE_URL/)
    expect(err?.message).toMatch(/SUPABASE_SERVICE_KEY/)
    expect(err?.message).toMatch(/SUPABASE_STORAGE_BUCKET/)
    expect(err?.message).toMatch(/ANTHROPIC_API_KEY/)
  })
})

// ---------------------------------------------------------------------------
// Brand research (3B)
// ---------------------------------------------------------------------------
//
// The five keys land together with the adapter, because `env.example.test.ts`
// fails the build if `EnvSchema` widens without `.env.example` following — the
// drift guard working as designed rather than as an obstacle.

describe('research env', () => {
  // The most important default in the file: a deployment that has not opted in
  // gets the feature absent, never a surprise invoice.
  it('defaults to no research provider at all', () => {
    const env = loadEnv(baseLocal as NodeJS.ProcessEnv)
    expect(env.RESEARCH_PROVIDER).toBe('none')
    expect(env.PERPLEXITY_API_KEY).toBeUndefined()
  })

  it('rejects perplexity without PERPLEXITY_API_KEY', () => {
    expect(() =>
      loadEnv({ ...baseLocal, RESEARCH_PROVIDER: 'perplexity' } as NodeJS.ProcessEnv),
    ).toThrow(/PERPLEXITY_API_KEY/)
  })

  it('accepts perplexity with a key, and defaults the model 3A measured', () => {
    const env = loadEnv({
      ...baseLocal,
      RESEARCH_PROVIDER: 'perplexity',
      PERPLEXITY_API_KEY: 'pplx-x',
    } as NodeJS.ProcessEnv)
    expect(env.RESEARCH_PROVIDER).toBe('perplexity')
    expect(env.RESEARCH_MODEL).toBe('sonar-deep-research')
  })

  // Decision 12's guards have defaults so an operator who never reads this
  // section is still capped — an unset budget guard is not a guard.
  it('caps runs by default, and coerces overrides from strings', () => {
    const env = loadEnv(baseLocal as NodeJS.ProcessEnv)
    expect(env.RESEARCH_MAX_ACTIVE_PER_WORKSPACE).toBe(2)
    expect(env.RESEARCH_MAX_JOBS_PER_DAY).toBe(10)

    const tuned = loadEnv({
      ...baseLocal,
      RESEARCH_MAX_JOBS_PER_DAY: '25',
    } as NodeJS.ProcessEnv)
    expect(tuned.RESEARCH_MAX_JOBS_PER_DAY).toBe(25)
  })

  it('refuses a cap of zero, which would read as "unlimited" and mean "never"', () => {
    expect(() =>
      loadEnv({ ...baseLocal, RESEARCH_MAX_JOBS_PER_DAY: '0' } as NodeJS.ProcessEnv),
    ).toThrow()
  })

  // Guideline auto-fill's Path S (Phase A). A search-grounded model, not the
  // deep researcher: the spike measured ~$0.01 / 5–7 s per section against
  // $0.38 / 4 min per run.
  it('defaults the section search to sonar-pro with its own capped per-day count', () => {
    const env = loadEnv(baseLocal as NodeJS.ProcessEnv)
    expect(env.RESEARCH_SECTION_MODEL).toBe('sonar-pro')
    expect(env.RESEARCH_SECTION_MAX_PER_DAY).toBe(20)
  })

  it('refuses a zero section cap, same reasoning as the run cap', () => {
    expect(() =>
      loadEnv({ ...baseLocal, RESEARCH_SECTION_MAX_PER_DAY: '0' } as NodeJS.ProcessEnv),
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Mission Passport
// ---------------------------------------------------------------------------
//
// Every case below guards a configuration that boots fine and fails silently
// later. Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 1b.

describe('passport env', () => {
  const passportSync = {
    PASSPORT_API_URL: 'https://passport-api.test',
    PASSPORT_API_KEY: 'pk_test',
    PASSPORT_WEBHOOK_SECRET: 'whsec',
  }

  it('leaves Passport entirely off when nothing is set', () => {
    const env = loadEnv(baseLocal as NodeJS.ProcessEnv)
    expect(env.PASSPORT_API_URL).toBeUndefined()
    expect(env.PASSPORT_WEBHOOK_SECRET).toBeUndefined()
    expect(env.PASSPORT_SUPABASE_URL).toBeUndefined()
  })

  it('accepts the sync half on its own', () => {
    const env = loadEnv({ ...baseLocal, ...passportSync } as NodeJS.ProcessEnv)
    expect(env.PASSPORT_API_URL).toBe('https://passport-api.test')
  })

  // The failure this prevents: the webhook still delivers, so the projection
  // fills up and looks alive, but placement is never read and nobody is ever
  // identity-linked. Symptom: N memberships, ~0 identity links.
  it('refuses a webhook secret with no back-channel credentials', () => {
    expect(() =>
      loadEnv({ ...baseLocal, PASSPORT_WEBHOOK_SECRET: 'whsec' } as NodeJS.ProcessEnv),
    ).toThrow(/PASSPORT_API_URL|PASSPORT_API_KEY/)
  })

  it('refuses either half of the back-channel pair alone', () => {
    expect(() =>
      loadEnv({ ...baseLocal, PASSPORT_API_URL: 'https://x' } as NodeJS.ProcessEnv),
    ).toThrow(/PASSPORT_API_KEY/)
    expect(() => loadEnv({ ...baseLocal, PASSPORT_API_KEY: 'pk' } as NodeJS.ProcessEnv)).toThrow(
      /PASSPORT_API_URL/,
    )
  })

  it('refuses a rotation overlap with nothing to overlap', () => {
    expect(() =>
      loadEnv({
        ...baseLocal,
        ...passportSync,
        PASSPORT_WEBHOOK_SECRET: undefined,
        PASSPORT_WEBHOOK_SECRET_PREV: 'old',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/PASSPORT_WEBHOOK_SECRET/)
  })

  // `PASSPORT_SUPABASE_URL` is the real SSO gate, so it is what pulls the rest of
  // the hosted-login config in. A missing value here surfaces only as a 403 from
  // Passport *after* the person has signed in and been redirected.
  it("requires the whole hosted-login set once Passport's project is named", () => {
    expect(() =>
      loadEnv({
        ...baseLocal,
        ...passportSync,
        PASSPORT_SUPABASE_URL: 'https://passport.supabase.test',
      } as NodeJS.ProcessEnv),
    ).toThrow(/PASSPORT_APP_ID|PASSPORT_DASHBOARD_URL|PASSPORT_SSO_CALLBACK_URL|APP_BASE_URL/)
  })

  it('accepts a complete hosted-login configuration', () => {
    const env = loadEnv({
      ...baseLocal,
      ...passportSync,
      PASSPORT_APP_ID: 'app-uuid',
      PASSPORT_SUPABASE_URL: 'https://passport.supabase.test',
      PASSPORT_DASHBOARD_URL: 'https://passport.test',
      PASSPORT_SSO_CALLBACK_URL: 'https://app.test/api/auth/passport/callback',
      // Required once hosted login is on: both redirects leave the backend for the
      // web app, and a relative one would resolve against the BACKEND origin and 404
      // with a live session in the fragment.
      APP_BASE_URL: 'https://app.test',
    } as NodeJS.ProcessEnv)
    expect(env.PASSPORT_SSO_ENABLED).toBe(true)
  })

  // `z.coerce.boolean()` would make the string "false" TRUE, because coercion
  // follows JS truthiness on a non-empty string — which would leave the
  // break-glass kill switch permanently on. The enum is what prevents it.
  it('parses the kill switch as a real boolean, so "false" means false', () => {
    const off = loadEnv({ ...baseLocal, PASSPORT_SSO_ENABLED: 'false' } as NodeJS.ProcessEnv)
    expect(off.PASSPORT_SSO_ENABLED).toBe(false)

    const on = loadEnv(baseLocal as NodeJS.ProcessEnv)
    expect(on.PASSPORT_SSO_ENABLED).toBe(true)
  })

  // The failure this prevents is specific and silent: sign-in completes, tokens are
  // minted, and the browser resolves a RELATIVE redirect against the BACKEND origin —
  // so the person lands on a 404 holding a live session in the URL fragment. Nothing
  // errors anywhere.
  it('requires APP_BASE_URL once hosted login is configured', () => {
    expect(() =>
      loadEnv({
        ...baseLocal,
        ...passportSync,
        PASSPORT_APP_ID: 'app-uuid',
        PASSPORT_SUPABASE_URL: 'https://passport.supabase.test',
        PASSPORT_DASHBOARD_URL: 'https://passport.test',
        PASSPORT_SSO_CALLBACK_URL: 'https://api.test/auth/passport/callback',
      } as NodeJS.ProcessEnv),
    ).toThrow(/APP_BASE_URL/)
  })

  it('rejects a kill-switch value that is neither true nor false', () => {
    expect(() =>
      loadEnv({ ...baseLocal, PASSPORT_SSO_ENABLED: 'yes' } as NodeJS.ProcessEnv),
    ).toThrow()
  })

  // Rule 9. Read from a query, a handler guard or an authz check, a configured
  // org silently discards every other org's events — and no reconciliation heals
  // it while the filter is still there. Refused by name rather than ignored,
  // because zod strips undeclared keys and would make setting it a silent no-op.
  it('refuses PASSPORT_ORG_ID by name, naming the alternative', () => {
    expect(() =>
      loadEnv({ ...baseLocal, PASSPORT_ORG_ID: 'org-uuid' } as NodeJS.ProcessEnv),
    ).toThrow(/PASSPORT_ORG_ID must not be set.*multi-org/s)
  })

  // Placement is `unit_scopes` + `role_cascade`, read from the registry at
  // startup. The singular form cannot even express this app's shape — there is no
  // value meaning {entity, brand, outlet}.
  it('refuses PASSPORT_UNIT_SCOPE by name, naming the registry read', () => {
    expect(() =>
      loadEnv({ ...baseLocal, PASSPORT_UNIT_SCOPE: 'brand' } as NodeJS.ProcessEnv),
    ).toThrow(/PASSPORT_UNIT_SCOPE must not be set.*registry/s)
  })

  it('treats an empty forbidden variable as unset, not as a violation', () => {
    // A shell that exports `PASSPORT_ORG_ID=` is nobody trying to configure
    // anything, and must not fail the boot.
    expect(() => loadEnv({ ...baseLocal, PASSPORT_ORG_ID: '' } as NodeJS.ProcessEnv)).not.toThrow()
  })
})
