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
  // The creator lookup's model (quick add, Phase F). **Separate from `LLM_MODEL`
  // because it must be search-grounded**, and on OpenRouter that is the `:online`
  // suffix — which is why the default is `LLM_MODEL`'s own model wearing it. The
  // vendor's mechanism is named here rather than in code, per `adapters.ts`.
  //
  // **A model id without `:online` will not search, and the failure is silent**:
  // the call succeeds and returns an answer with nothing behind it. Phase E
  // measured that; `LLMProvider.completeGrounded` carries the table. The boundary
  // rules catch it — an ungrounded figure is discarded — so a misconfigured
  // deployment gets `not-found` for every lookup rather than invented numbers.
  //
  // No spend cap, deliberately, which is `social-ideate.ts`' settled answer for
  // this class of call: it runs on the workspace's own configured LLM tokens.
  // The measured cost is ~$0.018 a lookup — an order above an ordinary
  // completion, because the plugin pastes its search results into the prompt,
  // and two orders below a $0.38 research run.
  INFLUENCER_LOOKUP_MODEL: NonEmpty.default('anthropic/claude-sonnet-4.6:online'),

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
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`invalid environment configuration:\n${issues}`)
  }
  return result.data
}
