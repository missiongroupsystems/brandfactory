import { z } from 'zod'
import { LLM_PROVIDER_IDS } from '@brandfactory/shared'
import { RESEARCH_PROVIDER_IDS } from '@brandfactory/adapter-research'

// Single env schema for the server. Per locked decision 13, every adapter
// gets discrete env vars (not a JSON blob); per locked decision 15, the
// `*_PROVIDER` enums only list shipped impls — adding a future provider
// widens the enum *and* the buildAdapters switch in lockstep.
//
// `LLM_PROVIDER_IDS` lives in `@brandfactory/shared` (single source of truth);
// `@brandfactory/adapter-llm` re-exports the type from there too. Widening the
// list anywhere fails compile in every consumer.

const NonEmpty = z.string().min(1)

// Kept separate from the `.superRefine(...)` wrap below so callers can
// introspect the key set (e.g. the `.env.example` drift guard).
const EnvObject = z.object({
  // Database (already in use by @brandfactory/db).
  DATABASE_URL: NonEmpty,

  // Auth provider.
  AUTH_PROVIDER: z.enum(['local', 'supabase']),

  // Storage provider.
  STORAGE_PROVIDER: z.enum(['local-disk', 'supabase']),

  // Realtime provider. Only one impl ships in Phase 3 — the enum widens
  // when a second impl lands so misconfigured envs fail at boot.
  REALTIME_PROVIDER: z.enum(['native-ws']),

  // LLM (active provider + model). Phase 3 reads from env only; workspace
  // overrides land with Phase 4's settings route.
  LLM_PROVIDER: z.enum(LLM_PROVIDER_IDS),
  LLM_MODEL: NonEmpty,

  // Local-disk blob store config.
  BLOB_LOCAL_DISK_ROOT: NonEmpty.optional(),
  BLOB_SIGNING_SECRET: NonEmpty.optional(),
  BLOB_PUBLIC_BASE_URL: NonEmpty.optional(),
  // Hard cap on the request body for `PUT /blobs/:key`. Defaults to 25 MiB.
  // Applies regardless of `STORAGE_PROVIDER` so the route can read it
  // without a conditional. Rejected with 413 before the body is read into
  // memory whenever `content-length` is present and over the cap.
  BLOB_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .default(25 * 1024 * 1024),

  // Supabase (auth + storage share these).
  SUPABASE_URL: NonEmpty.optional(),
  SUPABASE_ANON_KEY: NonEmpty.optional(),
  SUPABASE_SERVICE_KEY: NonEmpty.optional(),
  SUPABASE_JWKS_URL: NonEmpty.optional(),
  SUPABASE_JWT_AUDIENCE: NonEmpty.optional(),
  SUPABASE_JWT_ISSUER: NonEmpty.optional(),
  SUPABASE_STORAGE_BUCKET: NonEmpty.optional(),

  // Brand research (Stage 3). **`none` is the default, and that is the
  // feature's most important line of configuration**: research is the only
  // thing in this repo that spends money per click, so a deployment that has
  // not opted in gets it absent and explained rather than broken — the routes
  // pass no `onStartResearch`, and the rail's footer row does not exist.
  RESEARCH_PROVIDER: z.enum(RESEARCH_PROVIDER_IDS).default('none'),
  PERPLEXITY_API_KEY: NonEmpty.optional(),
  // Job input, not provider construction, so decision 10's cut of Quick mode
  // is a config change away rather than a rewrite. 3A measured this model at
  // $0.377 and 4.0 minutes for one brand.
  RESEARCH_MODEL: NonEmpty.default('sonar-deep-research'),
  // Decision 12's two caps, both enforced in 3C before the outbound call —
  // the only place enforcement is worth anything. Deliberately job *counts*
  // rather than a dollar budget: real spend is known only after a run
  // completes, so a dollar cap either blocks on an estimate or discovers the
  // overrun too late to stop it.
  RESEARCH_MAX_ACTIVE_PER_WORKSPACE: z.coerce.number().int().min(1).default(2),
  RESEARCH_MAX_JOBS_PER_DAY: z.coerce.number().int().min(1).default(10),
  // The ceiling `IN_PROGRESS` never had. A row that cannot reach a terminal
  // state is not inert — it fails the per-brand guard forever and holds a slot
  // in the cap above forever, and the cap above defaults to 2. Four times the
  // vendor's documented 15-minute ceiling, because being wrong about a slow run
  // costs one re-run while being stuck costs a database console.
  RESEARCH_JOB_MAX_MINUTES: z.coerce.number().int().min(1).default(60),
  // Guideline auto-fill's Path S (no report to read → one targeted search).
  // A different model tier from RESEARCH_MODEL on purpose: search-grounded,
  // synchronous, cents per call — Phase A's spike measured `sonar-pro` at
  // ~$0.01 and 5–7 seconds per section against the deep run's $0.38 and
  // 4 minutes.
  RESEARCH_SECTION_MODEL: NonEmpty.default('sonar-pro'),
  // Per-workspace, rolling 24h, counting only searches (Path R re-reads a
  // report already paid for and spends the user's own LLM tokens, which
  // shaping and chat already spend ungated). Twenty at ~$0.01 bounds a runaway
  // day at pocket change while letting a real brand fill every section twice
  // over.
  RESEARCH_SECTION_MAX_PER_DAY: z.coerce.number().int().min(1).default(20),

  // LLM provider keys.
  ANTHROPIC_API_KEY: NonEmpty.optional(),
  OPENAI_API_KEY: NonEmpty.optional(),
  OPENROUTER_API_KEY: NonEmpty.optional(),
  OPENROUTER_BASE_URL: NonEmpty.optional(),
  OLLAMA_BASE_URL: NonEmpty.optional(),

  // HTTP server (Phase 4).
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: NonEmpty.default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // CORS allowlist for split-origin deploys (Phase 8). Comma-separated;
  // unset → CORS is disabled (single-origin dev via Vite proxy is fine).
  // Gates both the Hono `cors()` middleware and the WS upgrade `Origin`
  // check so HTTP and WS can't drift out of sync.
  CORS_ALLOWED_ORIGINS: NonEmpty.optional(),

  // ── Mission Passport ───────────────────────────────────────────────────
  // Plan: `docs/executing/passport-sync-consumer-plan.md`.
  //
  // Every key is optional so an unconfigured deployment (and every test) boots
  // exactly as today. What is *not* optional is coherence: the `superRefine`
  // below refuses a half-configured Passport, because the halves fail in
  // opposite and equally silent ways. A webhook secret with no API credentials
  // projects every org and can identity-link nobody — N memberships, ~0 links.
  // API credentials with no webhook secret derive access from a projection that
  // never receives an event.
  //
  // Two variables are deliberately ABSENT and `loadEnv` refuses them by name:
  // `PASSPORT_ORG_ID` and `PASSPORT_UNIT_SCOPE`. See the note there.

  // The BACK-CHANNEL host (App API + the org API). Read with a trailing-slash
  // strip at every call site: `${url}/api/v1/...` over a trailing slash yields
  // `//api/v1/...`, which Passport answers with a flat 404 rather than a
  // redirect or a useful error.
  PASSPORT_API_URL: NonEmpty.optional(),
  // `X-API-Key` on every App API call, and the OAuth client-secret on the
  // hosted-login code exchange. Never logged.
  PASSPORT_API_KEY: NonEmpty.optional(),
  // This app's `app.id` in Passport's registry, which is also its OAuth
  // `client_id`.
  PASSPORT_APP_ID: NonEmpty.optional(),

  // HMAC secret for the sync receive endpoint. Its absence makes the receiver
  // refuse (503) rather than accept anything: an unset secret must never mean
  // "trust every caller", which would turn a misconfigured deploy into an open
  // write endpoint onto the projection.
  PASSPORT_WEBHOOK_SECRET: NonEmpty.optional(),
  // A second accepted secret, for the overlap window of a rotation. Without it
  // a rotation is a hard cutover.
  PASSPORT_WEBHOOK_SECRET_PREV: NonEmpty.optional(),

  // Guards the nightly-reconciliation trigger. The endpoint refuses to run when
  // this is unset rather than running unauthenticated, so an unconfigured
  // scheduler cannot look like a working one.
  PASSPORT_RECONCILE_SECRET: NonEmpty.optional(),

  // Passport's Supabase project — the issuer we verify Passport-issued tokens
  // against, on both the request path and the refresh path. **This is the real
  // SSO gate**: with it empty, SSO is inactive whatever `PASSPORT_SSO_ENABLED`
  // says, which is what lets local and CI stay app-native with no flag to
  // remember. Naming the wrong project presents as sessions that expire
  // immediately, not as a configuration error.
  PASSPORT_SUPABASE_URL: NonEmpty.optional(),
  // The BROWSER redirect target (`/authorize`). A DIFFERENT host from
  // `PASSPORT_API_URL` — Passport's frontend rather than its API. Confusing the
  // two is the classic hosted-login failure.
  PASSPORT_DASHBOARD_URL: NonEmpty.optional(),
  // Must equal the URI registered on Passport's PER-APP callback allow-list
  // byte for byte. A trailing slash or a case difference is a different URI,
  // and the code exchange is then a flat 403 that says nothing about why.
  PASSPORT_SSO_CALLBACK_URL: NonEmpty.optional(),
  // A break-glass switch, not a rollout toggle: in every environment it is on.
  // Set it `false` only to kill SSO during an incident *while keeping the rest
  // of the config in place* — the login router then sends everyone down the
  // app-native branch, which is safe only because that branch always exists.
  //
  // Parsed as an explicit enum rather than `z.coerce.boolean()`, which is a
  // trap here: coercion follows JS truthiness, so the string "false" would
  // become `true` and the kill switch would be unusable.
  // The FRONTEND origin, for the redirects that leave the backend on the hosted-login
  // round trip. Unset, a relative redirect is resolved by the browser against the
  // BACKEND origin and answers 404 — sign-in completing, tokens minted, and the person
  // landing on a dead URL with a live session in the fragment. Nothing errors.
  APP_BASE_URL: NonEmpty.optional(),
  PASSPORT_SSO_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
})

export const ENV_SCHEMA_KEYS = Object.keys(EnvObject.shape) as (keyof typeof EnvObject.shape)[]

export const EnvSchema = EnvObject.superRefine((env, ctx) => {
  function require_(field: keyof typeof env, when: string) {
    if (!env[field]) {
      ctx.addIssue({
        code: 'custom',
        path: [field as string],
        message: `${field as string} is required when ${when}`,
      })
    }
  }

  if (env.AUTH_PROVIDER === 'supabase') {
    require_('SUPABASE_JWKS_URL', "AUTH_PROVIDER='supabase'")
  }

  if (env.STORAGE_PROVIDER === 'local-disk') {
    require_('BLOB_LOCAL_DISK_ROOT', "STORAGE_PROVIDER='local-disk'")
    require_('BLOB_SIGNING_SECRET', "STORAGE_PROVIDER='local-disk'")
    require_('BLOB_PUBLIC_BASE_URL', "STORAGE_PROVIDER='local-disk'")
  }
  if (env.STORAGE_PROVIDER === 'supabase') {
    require_('SUPABASE_URL', "STORAGE_PROVIDER='supabase'")
    require_('SUPABASE_SERVICE_KEY', "STORAGE_PROVIDER='supabase'")
    require_('SUPABASE_STORAGE_BUCKET', "STORAGE_PROVIDER='supabase'")
  }

  switch (env.LLM_PROVIDER) {
    case 'anthropic':
      require_('ANTHROPIC_API_KEY', "LLM_PROVIDER='anthropic'")
      break
    case 'openai':
      require_('OPENAI_API_KEY', "LLM_PROVIDER='openai'")
      break
    case 'openrouter':
      require_('OPENROUTER_API_KEY', "LLM_PROVIDER='openrouter'")
      break
    case 'ollama':
      // No required vars — ollama defaults to http://127.0.0.1:11434.
      break
    default: {
      // Belt + suspenders for the `satisfies` guard above: if
      // `LLMProviderId` widens in adapter-llm and someone forgets to add
      // a case here, TS fails this assignment *and* runtime boot fails
      // loudly rather than silently skipping validation.
      const _exhaustive: never = env.LLM_PROVIDER
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_PROVIDER'],
        message: `unhandled LLM_PROVIDER: ${String(_exhaustive)}`,
      })
    }
  }

  // Same rule as every LLM provider: selecting a paid finder without its key is
  // a boot failure, not a first-click failure. `none` requires nothing, which
  // is what makes it a usable default rather than a broken one.
  if (env.RESEARCH_PROVIDER === 'perplexity') {
    require_('PERPLEXITY_API_KEY', "RESEARCH_PROVIDER='perplexity'")
  }

  // ── Passport coherence ─────────────────────────────────────────────────
  // Passport is off when nothing is set, and that must stay a clean state: an
  // unconfigured deployment boots and runs exactly as before. What we refuse is
  // a HALF-configured one, because each half fails silently on its own and the
  // symptoms point away from the cause.

  // The back-channel pair. Neither half does anything alone.
  if (env.PASSPORT_API_URL && !env.PASSPORT_API_KEY) {
    require_('PASSPORT_API_KEY', 'PASSPORT_API_URL is set')
  }
  if (env.PASSPORT_API_KEY && !env.PASSPORT_API_URL) {
    require_('PASSPORT_API_URL', 'PASSPORT_API_KEY is set')
  }

  // A receiver needs the back channel too, and not only for reconciliation: the
  // app's PLACEMENT (`unit_scopes` + `role_cascade`) is read from
  // `GET /apps/me/registry` at startup, and it is not a synced aggregate — no
  // event carries it and `snapshot()` does not either. Without the pair the
  // projection fills up correctly and derives nothing.
  if (env.PASSPORT_WEBHOOK_SECRET) {
    require_('PASSPORT_API_URL', 'PASSPORT_WEBHOOK_SECRET is set')
    require_('PASSPORT_API_KEY', 'PASSPORT_WEBHOOK_SECRET is set')
  }

  // A rotation overlap with nothing to overlap.
  if (env.PASSPORT_WEBHOOK_SECRET_PREV && !env.PASSPORT_WEBHOOK_SECRET) {
    require_('PASSPORT_WEBHOOK_SECRET', 'PASSPORT_WEBHOOK_SECRET_PREV is set')
  }

  // `PASSPORT_SUPABASE_URL` is what actually activates hosted login, so it is
  // the condition rather than the flag. Every value below is needed to complete
  // one round trip; a missing one surfaces only as a 403 from Passport after the
  // person has already signed in and been redirected.
  if (env.PASSPORT_SUPABASE_URL) {
    require_('PASSPORT_API_URL', 'PASSPORT_SUPABASE_URL is set (hosted login)')
    require_('PASSPORT_API_KEY', 'PASSPORT_SUPABASE_URL is set (hosted login)')
    require_('PASSPORT_APP_ID', 'PASSPORT_SUPABASE_URL is set (hosted login)')
    require_('PASSPORT_DASHBOARD_URL', 'PASSPORT_SUPABASE_URL is set (hosted login)')
    require_('PASSPORT_SSO_CALLBACK_URL', 'PASSPORT_SUPABASE_URL is set (hosted login)')
    require_('APP_BASE_URL', 'PASSPORT_SUPABASE_URL is set (hosted login)')
  }
})

export type Env = z.infer<typeof EnvSchema>

// Two Passport variables that must NOT exist, refused by name at boot.
//
// Both are absent from `EnvObject` on purpose, so this check reads `source`
// rather than the parsed result — zod strips undeclared keys, which would make
// setting either one a silent no-op instead of the loud failure it deserves.
// They are refused rather than warned about because each one *looks* like
// configuration and is in fact the bug it appears to solve.
const FORBIDDEN_PASSPORT_KEYS: Record<string, string> = {
  // Rule 9. Passport delivers every org this app is entitled to, and the read
  // model keeps all of them. A configured org reached from a query, a handler
  // guard or an authz check does not "add single-tenant support" — it silently
  // discards a paying org's events, leaving holes only a reconciliation can
  // heal. Thread `org_id` down from the acting user's membership instead.
  PASSPORT_ORG_ID:
    'a consumer is multi-org from day one (rule 9). Resolve org_id from the ' +
    "acting user's membership and pass it down; never read it from config.",
  // Placement is `unit_scopes` (a SET) plus `role_cascade`, read from
  // `GET /apps/me/registry` once at startup. This variable is the retired
  // SINGULAR vocabulary, which cannot express BrandFactory's shape at all —
  // there is no value meaning {entity, brand, outlet}. Even where it could, it
  // would be a local copy of a fact Passport owns, drifting silently the moment
  // an operator re-scopes the app, and the wrong placement denies every user
  // with no error anywhere.
  PASSPORT_UNIT_SCOPE:
    'placement is read from GET /apps/me/registry at startup (unit_scopes + ' +
    'role_cascade). The singular form is retired and cannot express this ' +
    "app's shape; a local copy would drift silently.",
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const forbidden = Object.keys(FORBIDDEN_PASSPORT_KEYS)
    .filter((key) => source[key] !== undefined && source[key] !== '')
    .map((key) => `  - ${key} must not be set: ${FORBIDDEN_PASSPORT_KEYS[key]}`)
  if (forbidden.length > 0) {
    throw new Error(`invalid environment configuration:\n${forbidden.join('\n')}`)
  }

  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`invalid environment configuration:\n${issues}`)
  }
  return result.data
}
