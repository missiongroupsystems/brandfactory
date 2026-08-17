import type { AuthProvider } from '@brandfactory/adapter-auth'
import type { BlobStore } from '@brandfactory/adapter-storage'
import type { LLMProvider } from '@brandfactory/adapter-llm'
import type { ResearchProvider } from '@brandfactory/adapter-research'
import type { RealtimeBus } from '@brandfactory/adapter-realtime'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './context'
import { parseCorsAllowedOrigins } from './cors'
import type { Db } from './db'
import type { Env } from './env'
import type { Logger } from './logger'
import { createAuthMiddleware, createOptionalAuthMiddleware } from './middleware/auth'
import { onError } from './middleware/error'
import { loggerMiddleware } from './middleware/logger'
import { requestIdMiddleware } from './middleware/request-id'
import type { AgentConcurrencyGuard } from './agent/concurrency'
import { createAgentRouter } from './routes/agent'
import { createBrandAssetsRouter } from './routes/assets'
import { createSocialPostsRouter } from './routes/social-posts'
import { createSocialIdeateRouter } from './routes/social-ideate'
import {
  createCopyWriter,
  createThemeIdeator,
  type IdeateCopyFn,
  type IdeateThemesFn,
} from './social/ideate'
import { createResearchConfigRouter } from './routes/research-config'
import { createResearchRouter } from './routes/research'
import {
  createResearchShaper,
  createSectionShaper,
  type ShapeResearchFn,
  type ShapeSectionFn,
} from './research/shape'
import { createBlobsRouter } from './routes/blobs'
import { createBlobUrlsRouter } from './routes/blobs-auth'
import { createBrandsRouter, createWorkspaceBrandsRouter } from './routes/brands'
import { createCanvasRouter } from './routes/canvas'
import { createHealthRouter } from './routes/health'
import { createMeRouter } from './routes/me'
import { createPassportAccess } from './passport/access'
import { createPassportOffboarding } from './passport/offboard'
import { createPassportBearerVerifier, type BearerVerifier } from './passport/verify-bearer'
import { createMessagesRouter } from './routes/messages'
import { createPassportAuthRouter } from './routes/passport-auth'
import { createPassportStructureRouter } from './routes/passport-structure'
import { createBrandLinker } from './passport/link-brand'
import { createPassportSyncRouter } from './routes/passport-sync'
import {
  createBrandProjectsRouter,
  createProjectsRouter,
  createWorkspaceProjectsRouter,
} from './routes/projects'
import { createSettingsRouter } from './routes/settings'
import { createWorkspacesRouter } from './routes/workspaces'

export interface AppDeps {
  env: Env
  log: Logger
  db: Db
  auth: AuthProvider
  storage: BlobStore
  realtime: RealtimeBus
  llm: LLMProvider
  research: ResearchProvider
  /**
   * 3D's shaping pass. Injectable so a test can drive the lifecycle without a
   * model; the default composes the real one from `db` + `llm` + `env`.
   */
  shapeResearch?: ShapeResearchFn
  /**
   * Path R of guideline auto-fill — the single-section shaper. Same seam, same
   * reason, same default composition as `shapeResearch`.
   */
  shapeSection?: ShapeSectionFn
  /**
   * The Post Planner's two passes. Same seam and same reason as the two above:
   * a route test drives the whole handler chain without a model, and the
   * default composes the real thing from `db` + `llm` + `env`.
   */
  ideateThemes?: IdeateThemesFn
  ideateCopy?: IdeateCopyFn
  agentGuard: AgentConcurrencyGuard
  /**
   * The shared two-issuer bearer verifier.
   *
   * Injected so `main.ts` can hand the SAME instance to the websocket upgrade. HTTP
   * and realtime resolving a token differently is a silent, asymmetric failure: the
   * app loads and never receives an event.
   */
  verifyBearer?: BearerVerifier
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  app.use('*', requestIdMiddleware())
  app.use('*', loggerMiddleware(deps.log))

  // CORS gate — only mounted when `CORS_ALLOWED_ORIGINS` is set, so the
  // single-origin dev default (Vite proxies `/api` + `/rt` → :3001) keeps
  // behaving exactly as before. For split-origin prod (`app.example.com`
  // vs `api.example.com`) the allowlist is strict: an unknown `Origin` is
  // echoed as `null`, which browsers treat as a CORS failure.
  const allowedOrigins = parseCorsAllowedOrigins(deps.env.CORS_ALLOWED_ORIGINS)
  if (allowedOrigins) {
    app.use(
      '*',
      cors({
        origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
        credentials: true,
        allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['content-type', 'authorization'],
      }),
    )
  }

  app.onError(onError)

  // `/health` gets optional auth so an authed probe is attributable but an
  // unauthenticated curl still works.
  app.use('/health/*', createOptionalAuthMiddleware(deps.auth))

  // Auth-required path prefixes. Scoping middleware per-prefix (rather than
  // behind a sub-app at `/`) keeps `/blobs`, `/health`, and `/rt`'s HTTP
  // surface outside the auth gate — the signed URL is the capability for
  // blobs, and `/rt` terminates at the ws upgrade handler, not HTTP.
  // ONE verifier for both transports. `main.ts` passes the instance it also gives to
  // `mountRealtime`; the default here exists so a test app needs no wiring.
  const passportAccess = createPassportAccess()
  const verifyBearer =
    deps.verifyBearer ?? createPassportBearerVerifier(deps.env, deps.auth, passportAccess)
  const authRequired = createAuthMiddleware(deps.auth, verifyBearer)
  app.use('/me/*', authRequired)
  app.use('/workspaces/*', authRequired)
  app.use('/brands/*', authRequired)
  app.use('/projects/*', authRequired)
  app.use('/blob-urls/*', authRequired)
  app.use('/research/*', authRequired)
  // The structure write-through. Gated, unlike `/auth/*` beside it: the forwarded token
  // is the acting person's, so there must BE an acting person.
  app.use('/passport/structure/*', authRequired)

  const composed = app
    .route('/health', createHealthRouter())
    .route('/me', createMeRouter({ auth: deps.auth }))
    // Deployment-level: is research on at all? Needed by the create dialog
    // before a brand exists; the brand-scoped GET still carries the same flag.
    .route('/research', createResearchConfigRouter({ env: deps.env }))
    .route('/workspaces', createWorkspacesRouter({ db: deps.db, storage: deps.storage }))
    .route('/workspaces', createWorkspaceBrandsRouter({ db: deps.db, storage: deps.storage }))
    .route('/workspaces', createWorkspaceProjectsRouter({ db: deps.db, storage: deps.storage }))
    .route('/workspaces', createSettingsRouter({ db: deps.db, env: deps.env }))
    .route(
      '/brands',
      createBrandsRouter({
        db: deps.db,
        storage: deps.storage,
        // The guidelines auto-fill (Phase C). Path S spends vendor cents, so
        // the provider and env guards ride in; Path R's shaper composes from
        // what the app already holds, exactly like `shapeResearch` below.
        research: deps.research,
        env: deps.env,
        shapeSection:
          deps.shapeSection ?? createSectionShaper({ db: deps.db, llm: deps.llm, env: deps.env }),
      }),
    )
    .route('/brands', createBrandProjectsRouter({ db: deps.db, storage: deps.storage }))
    // No `storage`: asset delete is a soft delete and must not sweep bytes.
    .route('/brands', createBrandAssetsRouter({ db: deps.db }))
    // Same shape and same scoping; posts never see a platform API or a file.
    .route('/brands', createSocialPostsRouter({ db: deps.db }))
    // The planner that fills that calendar. Stateless — it writes no row, so
    // it sits beside the posts router rather than owning any part of it.
    .route(
      '/brands',
      createSocialIdeateRouter({
        db: deps.db,
        ideateThemes:
          deps.ideateThemes ?? createThemeIdeator({ db: deps.db, llm: deps.llm, env: deps.env }),
        ideateCopy:
          deps.ideateCopy ?? createCopyWriter({ db: deps.db, llm: deps.llm, env: deps.env }),
      }),
    )
    // The only router that can spend money. Its guards live in
    // `research/service.ts` rather than in the handler, because the ticker
    // needs the same lifecycle and a guard inside a handler is one the
    // background sweep does not have.
    .route(
      '/brands',
      createResearchRouter({
        db: deps.db,
        research: deps.research,
        env: deps.env,
        // Stage 2 of a run, on the workspace's own model (3D). Built here
        // rather than injected, because it is a composition of things the app
        // already holds — and passing it as a function is what keeps the
        // lifecycle testable without a model.
        shape:
          deps.shapeResearch ?? createResearchShaper({ db: deps.db, llm: deps.llm, env: deps.env }),
        logger: deps.log,
      }),
    )
    .route('/projects', createProjectsRouter({ db: deps.db, storage: deps.storage }))
    .route('/projects', createCanvasRouter({ db: deps.db, realtime: deps.realtime }))
    .route('/projects', createMessagesRouter({ db: deps.db }))
    .route(
      '/projects',
      createAgentRouter({
        db: deps.db,
        env: deps.env,
        llm: deps.llm,
        realtime: deps.realtime,
        agentGuard: deps.agentGuard,
      }),
    )
    .route(
      '/blob-urls',
      createBlobUrlsRouter({ storage: deps.storage, maxBytes: deps.env.BLOB_MAX_BYTES }),
    )
    // Mission Passport's sync receive endpoint. Mounted unconditionally and
    // OUTSIDE the auth gate: Passport authenticates with an HMAC over the raw
    // body, not a JWT, and there is no user to scope to. It refuses with 503
    // when `PASSPORT_WEBHOOK_SECRET` is unset rather than being absent — a
    // missing route answers 404, which reads to an operator as "wrong URL"
    // instead of "not configured".
    .route(
      '/webhooks',
      createPassportSyncRouter({
        env: deps.env,
        // Offboarding (rule 6). The tombstone alone denies every HTTP read, but
        // `authorize` runs once per channel at subscribe time — so a revoked member's
        // OPEN socket keeps receiving events until it is closed. The hook needs the
        // realtime bus, which is why it is supplied here rather than inside the route.
        hooks: {
          // Offboarding (rule 6) and the `D1-b` brand link are composed here rather than
          // in one module, because they are unrelated concerns that happen to share a
          // hook bag: one revokes, the other joins two records.
          ...createPassportOffboarding({ realtime: deps.realtime, log: deps.log }),
          ...createBrandLinker({ log: deps.log }),
        },
      }),
    )
    // The email-first login router. OUTSIDE the auth gate by necessity: every route
    // here runs before anybody has proven anything. It behaves correctly with Passport
    // unconfigured — `/resolve-login` answers `app-native` for everybody, and
    // `/passport/start` redirects back with `?error=passport_unavailable`.
    .route('/auth', createPassportAuthRouter({ env: deps.env, access: passportAccess }))
    // Structure write-through (proposal §7) — the documented rule 3 exception, and the
    // ONLY writes this app makes to any Passport aggregate. Under the auth gate below,
    // because every route needs the acting person's own Passport token: the app's
    // `X-API-Key` must not be able to change an org's structure.
    .route(
      '/passport/structure',
      createPassportStructureRouter({ env: deps.env, access: passportAccess }),
    )

  if (deps.env.STORAGE_PROVIDER === 'local-disk') {
    // Blob routes are not auth-gated — the signed URL is the capability.
    // Mounted conditionally so Supabase deploys don't expose dead routes.
    composed.route(
      '/blobs',
      createBlobsRouter({
        storage: deps.storage,
        // `!` is safe: `STORAGE_PROVIDER=local-disk` conditionally-requires
        // `BLOB_SIGNING_SECRET` per env.ts's `superRefine`.
        signingSecret: deps.env.BLOB_SIGNING_SECRET!,
        maxBytes: deps.env.BLOB_MAX_BYTES,
      }),
    )
  }

  return composed
}

export type AppType = ReturnType<typeof createApp>
