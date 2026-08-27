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
import { createBrandResourcesRouter } from './routes/resources'
import { createSocialPostsRouter } from './routes/social-posts'
import { createSocialIdeateRouter } from './routes/social-ideate'
import {
  createCopyWriter,
  createThemeIdeator,
  type IdeateCopyFn,
  type IdeateThemesFn,
} from './social/ideate'
import { createCreatorLookup, type LookupCreatorFn } from './influencer/lookup'
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
import { createMessagesRouter } from './routes/messages'
import { createWorkspaceInfluencersRouter } from './routes/influencers'
import { createWorkspaceOutletsRouter } from './routes/outlets'
import { createWorkspaceVendorsRouter } from './routes/vendors'
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
  /**
   * Quick add's creator lookup. Same seam and same reason as the four above,
   * with one difference worth knowing: the default composition reads the model
   * from `env` rather than per workspace, because a lookup needs a
   * search-grounded model and a workspace override would silently remove the
   * grounding. `influencer/lookup.ts` carries the argument.
   */
  lookupCreator?: LookupCreatorFn
  agentGuard: AgentConcurrencyGuard
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
  const authRequired = createAuthMiddleware(deps.auth)
  app.use('/me/*', authRequired)
  app.use('/workspaces/*', authRequired)
  app.use('/brands/*', authRequired)
  app.use('/projects/*', authRequired)
  app.use('/blob-urls/*', authRequired)
  app.use('/research/*', authRequired)

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
    // Outlets are workspace-scoped with an optional brand, so they mount here
    // rather than under `/brands` — and no `storage`, because an outlet holds
    // no blob keys and its delete has nothing to sweep.
    .route('/workspaces', createWorkspaceOutletsRouter({ db: deps.db }))
    // Influencers mount beside outlets for the same reasons: workspace-scoped,
    // reachable by slug, and holding no blob keys — so no `storage` either.
    //
    // The router also carries quick add's lookup, which is why it takes an `llm`
    // by way of the composed function. **The mount is unconditional even though
    // the feature is not available everywhere**: only openrouter has a grounded
    // endpoint, and a deployment without one answers 503 with the fix in the
    // message. Mounting conditionally would drop the path out of `AppType`, which
    // is a worse trade — the type is how the client learns what exists.
    .route(
      '/workspaces',
      createWorkspaceInfluencersRouter({
        db: deps.db,
        lookupCreator:
          deps.lookupCreator ??
          createCreatorLookup({ llm: deps.llm, env: deps.env, log: deps.log }),
      }),
    )
    // Vendors mount beside both for the same reasons: workspace-scoped,
    // reachable by slug, and holding no blob keys — so no `storage` either.
    .route('/workspaces', createWorkspaceVendorsRouter({ db: deps.db }))
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
    // Named external links — no `storage` either, and for a stronger reason
    // than assets: a resource never carries a blob key at all.
    .route('/brands', createBrandResourcesRouter({ db: deps.db }))
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
