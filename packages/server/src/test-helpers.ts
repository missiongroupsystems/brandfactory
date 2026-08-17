import type { AuthProvider } from '@brandfactory/adapter-auth'
import type { BlobStore } from '@brandfactory/adapter-storage'
import type { LLMProvider } from '@brandfactory/adapter-llm'
import type { ResearchProvider } from '@brandfactory/adapter-research'
import type { RealtimeBus } from '@brandfactory/adapter-realtime'
import type {
  AgentMessage,
  Brand,
  BrandAsset,
  BrandAssetId,
  BrandGuidelineSection,
  BrandId,
  BrandSummary,
  Canvas,
  CanvasBlock,
  CanvasBlockId,
  Project,
  ProjectId,
  ProjectSummary,
  ResearchDraft,
  ResearchJobId,
  ShortlistView,
  SocialPost,
  SocialPostId,
  Workspace,
  WorkspaceId,
  WorkspaceSettings,
} from '@brandfactory/shared'
import { brandTldrLine, bySchedule } from '@brandfactory/shared'
import { createAgentConcurrencyGuard, type AgentConcurrencyGuard } from './agent/concurrency'
import { createApp, type AppDeps } from './app'
import { AssetNotInBrandError } from '@brandfactory/db'
import type { ResearchJob, SectionAutofillEvent } from '@brandfactory/db'
import type { Db } from './db'
import type { ShapeResearchFn, ShapeSectionFn } from './research/shape'
import type { IdeateCopyFn, IdeateThemesFn } from './social/ideate'
import type { Env } from './env'
import { createLogger, type Logger } from './logger'

// Fakes used by route / middleware / authz tests. Keep the shape matching
// the real Db exactly — switching a helper's signature in `@brandfactory/db`
// surfaces here as a type error.

export function silentLogger(): Logger {
  return createLogger({ level: 'error', write: () => {} })
}

/**
 * A `ShapeResearchResult` around a list of drafts, for the many tests that only
 * care what the lifecycle *does* with them.
 *
 * The outcome is derived the same way the real shaper derives it, so a test
 * cannot accidentally assert against a combination the production code would
 * never produce — an empty draft list reporting `ok`, say. Tests that are
 * specifically about the failure vocabulary build the result by hand.
 */
export function shaped(drafts: ResearchDraft[], sectionsReturned = drafts.length) {
  return {
    drafts,
    outcome:
      drafts.length > 0
        ? ('ok' as const)
        : sectionsReturned === 0
          ? ('no-sections' as const)
          : ('sections-dropped' as const),
    reportChars: 2000,
    sectionsReturned,
  }
}

interface FakeUserRow {
  id: string
  email: string
  displayName: string | null
  createdAt: string
  updatedAt: string
}

export interface FakeCanvasEventRow {
  id: string
  canvasId: string
  blockId: string | null
  op: 'add_block' | 'update_block' | 'remove_block' | 'restore_block' | 'pin' | 'unpin'
  actor: 'user' | 'agent'
  userId: string | null
  payload: unknown
  createdAt: string
}

export interface FakeAgentMessageRow {
  message: AgentMessage
  projectId: string
  userId: string | null
  createdAt: string
}

export interface FakeDbState {
  users: Map<string, FakeUserRow>
  workspaces: Map<string, Workspace>
  brands: Map<string, Brand>
  sections: Map<string, BrandGuidelineSection>
  assets: Map<string, BrandAsset>
  researchJobs: Map<string, ResearchJob>
  sectionAutofillEvents: SectionAutofillEvent[]
  /**
   * Make the next ledger write throw. **The only failure switch in this fake**,
   * and it earns the exception: the autofill ledger is written *after* a paid
   * vendor call, so "the insert failed" is the one db error whose handling
   * decides whether a user loses something they were billed for. Every other
   * query in here fails the request and costs nothing.
   */
  failNextSectionAutofillRecord?: boolean
  socialPosts: Map<string, SocialPost>
  projects: Map<string, Project>
  canvases: Map<string, Canvas>
  settings: Map<string, WorkspaceSettings>
  canvasBlocks: Map<string, CanvasBlock>
  canvasEvents: FakeCanvasEventRow[]
  agentMessages: FakeAgentMessageRow[]
}

export function createFakeDbState(): FakeDbState {
  return {
    users: new Map(),
    workspaces: new Map(),
    brands: new Map(),
    sections: new Map(),
    assets: new Map(),
    researchJobs: new Map(),
    sectionAutofillEvents: [],
    socialPosts: new Map(),
    projects: new Map(),
    canvases: new Map(),
    settings: new Map(),
    canvasBlocks: new Map(),
    canvasEvents: [],
    agentMessages: [],
  }
}

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter.toString().padStart(6, '0')}`
}

// The fake half of `assertAssetsInBrand` — same two rules (brand ownership
// and not-soft-deleted), same typed error, so the route's `instanceof` catch
// behaves identically against fake and real db.
function assertFakeAssetsInBrand(
  state: FakeDbState,
  brandId: BrandId,
  assetIds: readonly BrandAssetId[],
): void {
  const missing = assetIds.filter((id) => {
    const asset = state.assets.get(id)
    return !asset || asset.brandId !== brandId || asset.deletedAt !== null
  })
  if (missing.length > 0) throw new AssetNotInBrandError([...missing])
}

const NOW = '2026-04-19T00:00:00.000Z'

export function createFakeDb(state: FakeDbState = createFakeDbState()): {
  db: Db
  state: FakeDbState
} {
  // Mirrors the real `lastActivityAt` SQL expression (D1): greatest of
  // project.updatedAt, newest agent message, newest canvas event. Shared by
  // both summary listings for the same reason the SQL fragment is.
  function toSummary(project: Project, brandName: string): ProjectSummary {
    const msgTimes = state.agentMessages
      .filter((m) => m.projectId === project.id)
      .map((m) => m.createdAt)
    const canvas = [...state.canvases.values()].find((c) => c.projectId === project.id)
    const eventTimes = canvas
      ? state.canvasEvents.filter((e) => e.canvasId === canvas.id).map((e) => e.createdAt)
      : []
    const candidates = [project.updatedAt, ...msgTimes, ...eventTimes]
    return {
      ...project,
      brandName,
      lastActivityAt: candidates.reduce((a, b) => (a > b ? a : b)),
    }
  }

  const db: Db = {
    async getUserById(id) {
      return state.users.get(id) ?? null
    },

    async getWorkspaceById(id) {
      return state.workspaces.get(id) ?? null
    },
    async listWorkspacesByOwner(ownerUserId) {
      return [...state.workspaces.values()].filter((w) => w.ownerUserId === ownerUserId)
    },
    async listAllWorkspaces() {
      return [...state.workspaces.values()]
    },
    async createWorkspace(input) {
      const id = nextId('ws') as WorkspaceId
      const row: Workspace = {
        id,
        name: input.name,
        ownerUserId: input.ownerUserId,
        // A newly created workspace is ALWAYS unlinked. Passport learns about it later, if
        // a super admin creates the matching organisation — `POST /orgs` is super-admin
        // gated, so this app can never mint one. See proposal §8 `D1-b`.
        linkedToPassport: false,
        createdAt: NOW,
        updatedAt: NOW,
      }
      state.workspaces.set(id, row)
      return row
    },
    async updateWorkspace(id, input) {
      const existing = state.workspaces.get(id)
      if (!existing) return null
      const row: Workspace = { ...existing, name: input.name, updatedAt: NOW }
      state.workspaces.set(id, row)
      return row
    },
    async deleteWorkspace(id) {
      const existing = state.workspaces.get(id)
      if (!existing) return null
      state.workspaces.delete(id)
      state.settings.delete(id)
      for (const brand of [...state.brands.values()]) {
        // Cascade through the same helper so brands → projects → canvases →
        // blocks and assets/posts/sections go too, exactly as the FK chain does.
        if (brand.workspaceId === id) await db.deleteBrand(brand.id)
      }
      return existing
    },
    async listBlobKeysByWorkspace(workspaceId) {
      const keys: string[] = []
      for (const brand of state.brands.values()) {
        // Union of the per-brand arms — the real query does this in one SQL
        // pass joined up to `brands.workspaceId`; the fake reuses the helper.
        if (brand.workspaceId === workspaceId)
          keys.push(...(await db.listBlobKeysByBrand(brand.id)))
      }
      return keys
    },

    async getBrandById(id) {
      return state.brands.get(id) ?? null
    },
    async listBrandsByWorkspace(workspaceId) {
      return [...state.brands.values()].filter((b) => b.workspaceId === workspaceId)
    },
    async listBrandSummariesByWorkspace(workspaceId) {
      // Mirrors the real SQL: left-join counts + order by created_at.
      return [...state.brands.values()]
        .filter((b) => b.workspaceId === workspaceId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((b): BrandSummary => {
          // The real query resolves this with a filtered aggregate and its
          // mapper; the fake reaches the same answer through the same shared
          // helper, over the sections already in `state`. Hard-coding `null`
          // here would make every route test blind to the field.
          const sections = [...state.sections.values()]
            .filter((s) => s.brandId === b.id)
            .sort((x, y) => x.priority - y.priority)
          return {
            ...b,
            sectionCount: sections.length,
            projectCount: [...state.projects.values()].filter((p) => p.brandId === b.id).length,
            tldr: brandTldrLine(sections),
          }
        })
    },
    async createBrand(input) {
      const id = nextId('br') as BrandId
      const row: Brand = {
        id,
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
        websiteUrl: input.websiteUrl ?? null,
        // A newly created brand is unlinked until Passport answers and the returning
        // `unit.upserted` links it (plan 9c-bis). The fake models that honestly: it never
        // links, so anything asserting "created and immediately linked" fails here rather
        // than passing against a fake that is kinder than reality.
        linkedToPassport: false,
        createdAt: NOW,
        updatedAt: NOW,
      }
      state.brands.set(id, row)
      return row
    },
    async updateBrand(id, input) {
      const existing = state.brands.get(id)
      if (!existing) return null
      // Mirrors the real `set()`: `undefined` leaves a column alone, `null`
      // clears it. A spread of `input` wholesale would diverge from SQL.
      const row: Brand = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
        updatedAt: NOW,
      }
      state.brands.set(id, row)
      return row
    },
    async deleteBrand(id) {
      const existing = state.brands.get(id)
      if (!existing) return null
      state.brands.delete(id)
      for (const [sid, section] of state.sections) {
        if (section.brandId === id) state.sections.delete(sid)
      }
      for (const [aid, asset] of state.assets) {
        if (asset.brandId === id) state.assets.delete(aid)
      }
      for (const [pid, post] of state.socialPosts) {
        if (post.brandId === id) state.socialPosts.delete(pid)
      }
      for (const [pid, project] of [...state.projects.entries()]) {
        if (project.brandId === id) {
          // Cascade through the same helper so canvas/messages/events go too.
          await db.deleteProject(pid as ProjectId)
        }
      }
      return existing
    },
    async listBlobKeysByBrand(brandId) {
      const projectIds = [...state.projects.values()]
        .filter((p) => p.brandId === brandId)
        .map((p) => p.id)
      const canvasIds = [...state.canvases.values()]
        .filter((c) => projectIds.includes(c.projectId))
        .map((c) => c.id)
      const blockKeys = [...state.canvasBlocks.values()]
        .filter((b) => canvasIds.includes(b.canvasId))
        .map((b) => ('blobKey' in b ? b.blobKey : null))
        .filter((k): k is string => typeof k === 'string')
      // Mirrors the real query's second arm (2A): `source = 'blob'` only — a
      // `link` row's url is somebody else's host — and soft-deleted rows
      // *included*, because the brand is going away and every byte goes with it.
      const assetKeys = [...state.assets.values()]
        .filter((a) => a.brandId === brandId)
        .map((a) => (a.source === 'blob' ? a.blobKey : null))
        .filter((k): k is string => k !== null)
      return [...blockKeys, ...assetKeys]
    },
    // Mirrors `listStillReferencedBlobKeys`: every table that holds a key,
    // soft-deleted rows *included* — a hidden row still owns its bytes. Called
    // after the cascade, so whatever it finds is outside the deleted resource.
    async listStillReferencedBlobKeys(keys) {
      if (keys.length === 0) return []
      const wanted = new Set(keys)
      const blockKeys = [...state.canvasBlocks.values()]
        .map((b) => ('blobKey' in b ? b.blobKey : null))
        .filter((k): k is string => typeof k === 'string')
      const assetKeys = [...state.assets.values()]
        .map((a) => (a.source === 'blob' ? a.blobKey : null))
        .filter((k): k is string => k !== null)
      return [...new Set([...blockKeys, ...assetKeys].filter((k) => wanted.has(k)))]
    },
    async listSectionsByBrand(brandId) {
      return [...state.sections.values()]
        .filter((s) => s.brandId === brandId)
        .sort((a, b) => a.priority - b.priority)
    },
    async updateBrandGuidelines(brandId, sections) {
      // Mirrors the real query: the payload is the complete desired state, so
      // sections it omits are deleted (see `keptIds` in db/queries/brands.ts).
      const keptIds = new Set<string>()
      for (const section of sections) {
        if (section.id) {
          const existing = state.sections.get(section.id)
          if (!existing || existing.brandId !== brandId) {
            throw new Error(`section ${section.id} not in brand ${brandId}`)
          }
          state.sections.set(section.id, {
            ...existing,
            label: section.label,
            body: section.body,
            priority: section.priority,
            createdBy: section.createdBy,
            updatedAt: NOW,
          })
          keptIds.add(section.id)
        } else {
          const id = nextId('sec') as BrandGuidelineSection['id']
          state.sections.set(id, {
            id,
            brandId,
            label: section.label,
            body: section.body,
            priority: section.priority,
            createdBy: section.createdBy,
            createdAt: NOW,
            updatedAt: NOW,
          })
          keptIds.add(id)
        }
      }
      for (const existing of [...state.sections.values()]) {
        if (existing.brandId === brandId && !keptIds.has(existing.id)) {
          state.sections.delete(existing.id)
        }
      }
      return [...state.sections.values()]
        .filter((s) => s.brandId === brandId)
        .sort((a, b) => a.priority - b.priority)
    },

    // Brand assets. Every one of these mirrors the real query rather than doing
    // the obvious thing, because a fake that spreads its input wholesale agrees
    // with a broken implementation — see `updateAsset` and `listAssetsByBrand`
    // in particular.
    async listAssetsByBrand(brandId) {
      // Soft-deleted rows out, `proposed` rows *in*, ordered by kind then
      // position — the real `orderBy(asc(kind), asc(position))`.
      return [...state.assets.values()]
        .filter((a) => a.brandId === brandId && a.deletedAt === null)
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.position - b.position)
    },
    async createAsset(input) {
      const id = nextId('as') as BrandAssetId
      const base = {
        id,
        brandId: input.brandId,
        kind: input.kind,
        label: input.label,
        position: input.position,
        // Taken from the input and **never defaulted here.** The real
        // `createAsset` requires it, and a fake that resolved
        // `defaultLibraryFor` itself would let every route test pass with the
        // route's own resolution deleted.
        library: input.library,
        role: input.role ?? null,
        status: input.status ?? 'active',
        alt: input.alt ?? null,
        mime: input.mime ?? null,
        filename: input.filename ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        sizeBytes: input.sizeBytes ?? null,
        deletedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      }
      let asset: BrandAsset
      switch (input.source) {
        case 'inline':
          asset = { ...base, source: 'inline', value: input.value }
          break
        case 'blob':
          asset = { ...base, source: 'blob', blobKey: input.blobKey }
          break
        case 'link':
          asset = { ...base, source: 'link', url: input.url }
          break
      }
      state.assets.set(id, asset)
      return asset
    },
    async updateAsset(brandId, id, patch) {
      const existing = state.assets.get(id)
      // Scoped by brand as well as id — an asset from another brand misses —
      // and by `deletedAt IS NULL`, so a patch cannot land on a row no read
      // path returns.
      if (!existing || existing.brandId !== brandId || existing.deletedAt !== null) return null
      // `undefined` leaves a column alone, `null` clears it. A spread of
      // `patch` wholesale would agree with a `set()` that had lost the rule.
      const updated: BrandAsset = {
        ...existing,
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.alt !== undefined ? { alt: patch.alt } : {}),
        ...(patch.library !== undefined ? { library: patch.library } : {}),
        updatedAt: NOW,
      }
      state.assets.set(id, updated)
      return updated
    },
    async softDeleteAsset(brandId, id) {
      const existing = state.assets.get(id)
      // Already-hidden rows miss, so a double delete 404s rather than moving
      // `deletedAt` forward under an Undo that is still on screen.
      if (!existing || existing.brandId !== brandId || existing.deletedAt !== null) return null
      // The row stays in the map. Nothing sweeps its bytes.
      const updated: BrandAsset = { ...existing, deletedAt: NOW, updatedAt: NOW }
      state.assets.set(id, updated)
      return updated
    },
    async restoreAsset(brandId, id) {
      const existing = state.assets.get(id)
      // Only matches a row that is actually hidden — the mirror image of
      // `softDeleteAsset`, so a replayed Undo cannot touch a live asset.
      if (!existing || existing.brandId !== brandId || existing.deletedAt === null) return null
      const updated: BrandAsset = { ...existing, deletedAt: null, updatedAt: NOW }
      state.assets.set(id, updated)
      return updated
    },
    async reorderAssets(brandId, updates) {
      // **Resolve every row before writing any of them.** The real query runs
      // in a transaction, so a batch naming one bad id leaves the brand's
      // ordering exactly as it found it. A fake that walked the list mutating
      // as it went would report a half-applied reorder as correct — which is
      // the one property the batch route exists to provide over N patches.
      const resolved = updates.map(({ id, position }) => {
        const existing = state.assets.get(id)
        if (!existing || existing.brandId !== brandId || existing.deletedAt !== null) {
          throw new Error(`Asset ${id} not found in brand ${brandId}`)
        }
        return { existing, position }
      })
      for (const { existing, position } of resolved) {
        state.assets.set(existing.id, { ...existing, position, updatedAt: NOW })
      }
      return db.listAssetsByBrand(brandId)
    },

    // Social posts. `assetIds` stored inline — the fake has no join table, but
    // it must mirror the real scoping exactly: brand-scoped writes, `deletedAt
    // IS NULL` filters, and the asset-ownership gate (cross-brand *and*
    // soft-deleted assets rejected, with the same typed error the route
    // converts to 400).
    async listSocialPostsByBrand(brandId) {
      // Soft-deleted rows out; `bySchedule` *is* the real SQL ordering
      // (`scheduled_at asc nulls first, created_at asc`). The fake clock never
      // ticks, so `sort`'s stability stands in for the `createdAt` tie-break —
      // insertion order, as the research fakes already rely on.
      return [...state.socialPosts.values()]
        .filter((p) => p.brandId === brandId && p.deletedAt === null)
        .sort(bySchedule)
    },
    async createSocialPost(brandId, input) {
      assertFakeAssetsInBrand(state, brandId, input.assetIds ?? [])
      const id = nextId('sp') as SocialPostId
      const row: SocialPost = {
        id,
        brandId,
        platform: input.platform,
        scheduledAt: input.scheduledAt ?? null,
        body: input.body ?? '',
        status: input.status ?? 'draft',
        // No `??` here, unlike its neighbours: the schema's `.default('user')`
        // has already run, so the fake and the real query agree that this key
        // is always present by the time a create reaches the data layer.
        createdBy: input.createdBy,
        assetIds: input.assetIds ?? [],
        deletedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      }
      state.socialPosts.set(id, row)
      return row
    },
    async updateSocialPost(brandId, id, patch) {
      // The ownership gate runs before the row lookup, as the real query runs
      // it before the row update — a bad assetId rejects the whole patch even
      // when the post itself would miss.
      if (patch.assetIds !== undefined) {
        assertFakeAssetsInBrand(state, brandId, patch.assetIds)
      }
      const existing = state.socialPosts.get(id)
      // Scoped by brand as well as id, and by `deletedAt IS NULL` — a patch
      // cannot land on a row no read path returns.
      if (!existing || existing.brandId !== brandId || existing.deletedAt !== null) return null
      // `undefined` leaves a key alone; `assetIds` is a full replacement.
      const updated: SocialPost = {
        ...existing,
        ...(patch.platform !== undefined ? { platform: patch.platform } : {}),
        ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.assetIds !== undefined ? { assetIds: patch.assetIds } : {}),
        updatedAt: NOW,
      }
      state.socialPosts.set(id, updated)
      return updated
    },
    async softDeleteSocialPost(brandId, id) {
      const existing = state.socialPosts.get(id)
      // Already-hidden rows miss, so a double delete 404s rather than moving
      // `deletedAt` forward under an Undo that is still on screen.
      if (!existing || existing.brandId !== brandId || existing.deletedAt !== null) return null
      // `assetIds` stay on the row — join rows are untouched by a soft delete.
      const updated: SocialPost = { ...existing, deletedAt: NOW, updatedAt: NOW }
      state.socialPosts.set(id, updated)
      return updated
    },
    async restoreSocialPost(brandId, id) {
      const existing = state.socialPosts.get(id)
      // Only matches a row that is actually hidden, so a replayed Undo is inert.
      if (!existing || existing.brandId !== brandId || existing.deletedAt === null) return null
      const updated: SocialPost = { ...existing, deletedAt: null, updatedAt: NOW }
      state.socialPosts.set(id, updated)
      return updated
    },

    // Brand research jobs. Same rule as the assets fakes above: mirror the real
    // query, do not do the obvious thing. `finishResearchJob` in particular has
    // to keep the "terminal states are terminal" `WHERE`, or a test would pass
    // against a fake that lets two finishers overwrite each other.
    async createResearchJob(input) {
      const id = nextId('job') as ResearchJobId
      const job: ResearchJob = {
        id,
        brandId: input.brandId,
        status: 'IN_PROGRESS',
        provider: input.provider,
        model: input.model,
        input: input.input,
        externalId: null,
        report: null,
        citations: [],
        drafts: [],
        error: null,
        reportProjectId: null,
        costUsd: null,
        createdBy: input.createdBy,
        // **Not `NOW`, unlike every other fake in this file** — and this is the
        // one place that distinction is behaviour rather than tidiness. The
        // lifecycle reasons about a job's *age*: `UNSUBMITTED_GRACE_MS` closes a
        // row that never got submitted, and `RESEARCH_JOB_MAX_MINUTES` closes
        // one the vendor never finished. `NOW` is a fixed date in the past, so a
        // job stamped with it is born months stale and every reconcile test
        // would assert against a job the code is right to abandon.
        //
        // The two tests that care about age pass `now` explicitly, which is what
        // keeps them deterministic; this only has to be recent, not fixed.
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
      }
      state.researchJobs.set(id, job)
      return job
    },
    async getResearchJob(brandId, jobId) {
      const job = state.researchJobs.get(jobId)
      // Scoped by brand as well as id, like every other cross-boundary read.
      return job && job.brandId === brandId ? job : null
    },
    async getLatestResearchJob(brandId) {
      const jobs = [...state.researchJobs.values()].filter((j) => j.brandId === brandId)
      // Insertion order stands in for `createdAt DESC` — the fake clock does
      // not tick, so the real ordering column cannot break the tie.
      return jobs.length ? jobs[jobs.length - 1]! : null
    },
    async getResearchJobByReportProject(projectId) {
      const jobs = [...state.researchJobs.values()].filter((j) => j.reportProjectId === projectId)
      // Insertion order stands in for `createdAt DESC`, as in the fake above.
      return jobs.length ? jobs[jobs.length - 1]! : null
    },
    async hasActiveResearchJob(brandId) {
      return [...state.researchJobs.values()].some(
        (j) => j.brandId === brandId && j.status === 'IN_PROGRESS',
      )
    },
    async countActiveResearchJobsForWorkspace(workspaceId) {
      return [...state.researchJobs.values()].filter((j) => {
        const brand = state.brands.get(j.brandId)
        return brand?.workspaceId === workspaceId && j.status === 'IN_PROGRESS'
      }).length
    },
    async countResearchJobsTodayForWorkspace(workspaceId) {
      // Every job, every status — a failed run may still have been billed, so
      // the money guard counts it. The fake clock never advances, so every row
      // is inside the rolling window.
      return [...state.researchJobs.values()].filter(
        (j) => state.brands.get(j.brandId)?.workspaceId === workspaceId,
      ).length
    },
    async listInFlightResearchJobs() {
      return [...state.researchJobs.values()].filter((j) => j.status === 'IN_PROGRESS')
    },
    async setResearchJobExternalId(jobId, externalId) {
      const job = state.researchJobs.get(jobId)
      if (!job) return null
      const updated = { ...job, externalId }
      state.researchJobs.set(jobId, updated)
      return updated
    },
    async finishResearchJob(jobId, input) {
      const job = state.researchJobs.get(jobId)
      // The real `WHERE status = 'IN_PROGRESS'`: a second finisher loses, and
      // finds out by getting null back.
      if (!job || job.status !== 'IN_PROGRESS') return null
      const updated: ResearchJob = {
        ...job,
        status: input.status,
        report: input.report ?? null,
        citations: input.citations ?? [],
        drafts: input.drafts ?? [],
        error: input.error ?? null,
        costUsd: input.costUsd ?? null,
        completedAt: NOW,
      }
      state.researchJobs.set(jobId, updated)
      return updated
    },
    // Unscoped by status and by brand, like the real query — see it for why. The
    // row is already `COMPLETED` when this runs, and the one thing a writer called
    // from a swallowed `try` must not do is invent a reason to reject.
    async setResearchJobReportProject(jobId, projectId) {
      const job = state.researchJobs.get(jobId)
      if (!job) return null
      const updated = { ...job, reportProjectId: projectId }
      state.researchJobs.set(jobId, updated)
      return updated
    },
    // Mirrors the real query's `WHERE`, both halves of it — brand scope and the
    // COMPLETED requirement. A fake that cleared drafts on any row would let a
    // test pass against a race the real column refuses.
    async clearResearchJobDrafts(brandId, jobId) {
      const job = state.researchJobs.get(jobId)
      if (!job || job.brandId !== brandId || job.status !== 'COMPLETED') return null
      const updated = { ...job, drafts: [] }
      state.researchJobs.set(jobId, updated)
      return updated
    },

    // Section auto-fill events. Append-only, like the real table.
    async recordSectionAutofill(input) {
      if (state.failNextSectionAutofillRecord) {
        state.failNextSectionAutofillRecord = false
        throw new Error('ledger insert failed')
      }
      const event: SectionAutofillEvent = {
        id: nextId('safe'),
        brandId: input.brandId,
        label: input.label,
        source: input.source,
        model: input.model,
        costUsd: input.costUsd,
        sources: input.sources,
        createdBy: input.createdBy,
        createdAt: NOW,
      }
      state.sectionAutofillEvents.push(event)
      return event
    },
    async countSectionAutofillsTodayForWorkspace(workspaceId) {
      // Only searches — the cap protects vendor money and Path R spends none.
      // The fake clock never advances, so every row is inside the rolling
      // window, same as the research count above.
      return state.sectionAutofillEvents.filter(
        (e) => e.source === 'search' && state.brands.get(e.brandId)?.workspaceId === workspaceId,
      ).length
    },

    async getProjectById(id) {
      return state.projects.get(id) ?? null
    },
    async listProjectsByBrand(brandId) {
      return [...state.projects.values()].filter((p) => p.brandId === brandId)
    },
    async listProjectSummariesByBrand(brandId) {
      const brand = state.brands.get(brandId)
      if (!brand) return []
      return [...state.projects.values()]
        .filter((p) => p.brandId === brandId)
        .map((p) => toSummary(p, brand.name))
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    },
    async listRecentProjectsByWorkspace(workspaceId, limit) {
      const brandById = new Map(
        [...state.brands.values()]
          .filter((b) => b.workspaceId === workspaceId)
          .map((b) => [b.id, b]),
      )
      const summaries: ProjectSummary[] = []
      for (const project of state.projects.values()) {
        const brand = brandById.get(project.brandId)
        if (!brand) continue
        summaries.push(toSummary(project, brand.name))
      }
      summaries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
      return summaries.slice(0, limit)
    },
    async listBlobKeysByProject(projectId) {
      const canvas = [...state.canvases.values()].find((c) => c.projectId === projectId)
      if (!canvas) return []
      return [...state.canvasBlocks.values()]
        .filter((b) => b.canvasId === canvas.id)
        .map((b) => ('blobKey' in b ? b.blobKey : null))
        .filter((k): k is string => typeof k === 'string')
    },
    async createProjectWithCanvas(input) {
      const id = nextId('pr') as ProjectId
      const base = {
        id,
        brandId: input.brandId,
        name: input.name,
        createdAt: NOW,
        updatedAt: NOW,
      }
      const project: Project =
        input.kind === 'standardized'
          ? { ...base, kind: 'standardized', templateId: input.templateId }
          : { ...base, kind: 'freeform' }
      state.projects.set(id, project)
      const canvasId = nextId('cv') as Canvas['id']
      const canvas: Canvas = { id: canvasId, projectId: id, createdAt: NOW, updatedAt: NOW }
      state.canvases.set(canvasId, canvas)
      return { project, canvas }
    },
    async updateProject(id, input) {
      const existing = state.projects.get(id)
      if (!existing) return null
      const row: Project = { ...existing, name: input.name, updatedAt: NOW }
      state.projects.set(id, row)
      return row
    },
    async deleteProject(id) {
      const existing = state.projects.get(id)
      if (!existing) return null
      state.projects.delete(id)
      for (const [cid, canvas] of [...state.canvases.entries()]) {
        if (canvas.projectId === id) {
          state.canvases.delete(cid)
          for (const [bid, block] of [...state.canvasBlocks.entries()]) {
            if (block.canvasId === cid) state.canvasBlocks.delete(bid)
          }
          state.canvasEvents = state.canvasEvents.filter((e) => e.canvasId !== cid)
        }
      }
      state.agentMessages = state.agentMessages.filter((m) => m.projectId !== id)
      return existing
    },
    async getCanvasByProject(projectId) {
      return [...state.canvases.values()].find((canvas) => canvas.projectId === projectId) ?? null
    },

    async getWorkspaceSettings(workspaceId) {
      return state.settings.get(workspaceId) ?? null
    },
    async upsertWorkspaceSettings(input) {
      const row: WorkspaceSettings = {
        workspaceId: input.workspaceId,
        llmProviderId: input.llmProviderId,
        llmModel: input.llmModel,
        updatedAt: NOW,
      }
      state.settings.set(input.workspaceId, row)
      return row
    },

    async getBlockById(id) {
      return state.canvasBlocks.get(id) ?? null
    },
    async listActiveBlocks(canvasId) {
      return [...state.canvasBlocks.values()]
        .filter((b) => b.canvasId === canvasId && b.deletedAt === null)
        .sort((a, b) => a.position - b.position)
    },
    async createBlock(input) {
      const id = nextId('bk') as CanvasBlockId
      const base = {
        id,
        canvasId: input.canvasId,
        position: input.position,
        isPinned: false,
        pinnedAt: null,
        createdBy: input.createdBy,
        deletedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      }
      let block: CanvasBlock
      switch (input.kind) {
        case 'text':
          block = { ...base, kind: 'text', body: input.body }
          break
        case 'image':
          block = {
            ...base,
            kind: 'image',
            blobKey: input.blobKey,
            ...(input.alt !== undefined ? { alt: input.alt } : {}),
            ...(input.width !== undefined ? { width: input.width } : {}),
            ...(input.height !== undefined ? { height: input.height } : {}),
          }
          break
        case 'file':
          block = {
            ...base,
            kind: 'file',
            blobKey: input.blobKey,
            filename: input.filename,
            mime: input.mime,
          }
          break
      }
      state.canvasBlocks.set(id, block)
      return block
    },
    async updateBlock(id, patch) {
      const existing = state.canvasBlocks.get(id)
      if (!existing) throw new Error(`Block ${id} not found`)
      const updated: CanvasBlock = { ...existing, ...patch, updatedAt: NOW } as CanvasBlock
      state.canvasBlocks.set(id, updated)
      return updated
    },
    async softDeleteBlock(id) {
      const existing = state.canvasBlocks.get(id)
      if (!existing) throw new Error(`Block ${id} not found`)
      const updated: CanvasBlock = { ...existing, deletedAt: NOW, updatedAt: NOW }
      state.canvasBlocks.set(id, updated)
      return updated
    },
    async setPinned(id, value) {
      const existing = state.canvasBlocks.get(id)
      if (!existing) throw new Error(`Block ${id} not found`)
      const updated: CanvasBlock = {
        ...existing,
        isPinned: value,
        pinnedAt: value ? NOW : null,
        updatedAt: NOW,
      }
      state.canvasBlocks.set(id, updated)
      return updated
    },
    async getShortlistView(projectId) {
      const canvas = [...state.canvases.values()].find((c) => c.projectId === projectId)
      const view: ShortlistView = {
        projectId,
        blockIds: canvas
          ? [...state.canvasBlocks.values()]
              .filter((b) => b.canvasId === canvas.id && b.isPinned && b.deletedAt === null)
              .sort((a, b) => a.position - b.position)
              .map((b) => b.id)
          : [],
      }
      return view
    },
    async appendCanvasEvent(input) {
      const row: FakeCanvasEventRow = {
        id: nextId('ev'),
        canvasId: input.canvasId,
        blockId: input.blockId ?? null,
        op: input.op,
        actor: input.actor,
        userId: input.userId ?? null,
        payload: input.payload,
        createdAt: NOW,
      }
      state.canvasEvents.push(row)
      return row
    },

    async listAgentMessages(projectId, opts) {
      const limit = opts?.limit ?? 40
      const rows = state.agentMessages.filter((r) => r.projectId === projectId)
      // Latest `limit` by createdAt, then re-order oldest first for the caller.
      const latest = rows.slice(-limit)
      return latest.map((r) => r.message)
    },
    async appendAgentMessage(input) {
      const id = nextId('am')
      const message: AgentMessage = {
        kind: 'message',
        id,
        role: input.role,
        content: input.content,
      }
      state.agentMessages.push({
        message,
        projectId: input.projectId,
        userId: input.userId ?? null,
        createdAt: NOW,
      })
      return message
    },
  }
  return { db, state }
}

export function createFakeAuth(tokenToUserId: Record<string, string>): AuthProvider {
  return {
    async verifyToken(token: string) {
      const userId = tokenToUserId[token]
      if (!userId) throw new Error('invalid token')
      return { userId }
    },
    async getUserById(id: string) {
      return {
        id,
        email: `${id}@example.com`,
        displayName: null,
        createdAt: NOW,
        updatedAt: NOW,
      }
    },
  }
}

export function createFakeAdapters(overrides: Partial<AppDeps> = {}): Omit<AppDeps, 'env' | 'log'> {
  const storage: BlobStore = overrides.storage ?? {
    async put() {},
    async get() {
      return new Uint8Array()
    },
    async delete() {},
    async getSignedReadUrl() {
      return 'http://signed'
    },
    async getSignedWriteUrl() {
      return { url: 'http://signed' }
    },
  }
  const realtime: RealtimeBus = overrides.realtime ?? {
    async publish() {},
    subscribe: () => () => {},
    disconnectUser: () => 0,
  }
  const llm: LLMProvider = overrides.llm ?? {
    // Return a placeholder object; tests that call it will fail loudly.
    getModel: () => {
      throw new Error('llm.getModel not expected in test')
    },
  }
  // The noop, unless a test says otherwise. Matches the shipped default
  // (`RESEARCH_PROVIDER=none`) so a route test that reaches the provider by
  // accident fails loudly instead of pretending to research something.
  const research: ResearchProvider = overrides.research ?? {
    start: () => Promise.reject(new Error('research.start not expected in test')),
    poll: () => Promise.reject(new Error('research.poll not expected in test')),
    searchSection: () => Promise.reject(new Error('research.searchSection not expected in test')),
  }
  const { db } = overrides.db ? { db: overrides.db } : createFakeDb()
  const auth = overrides.auth ?? createFakeAuth({})
  const agentGuard = overrides.agentGuard ?? createAgentConcurrencyGuard()
  return { db, auth, storage, realtime, llm, research, agentGuard }
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    DATABASE_URL: 'postgres://x',
    AUTH_PROVIDER: 'local',
    STORAGE_PROVIDER: 'local-disk',
    REALTIME_PROVIDER: 'native-ws',
    LLM_PROVIDER: 'anthropic',
    LLM_MODEL: 'claude-sonnet-4-6',
    BLOB_LOCAL_DISK_ROOT: '/tmp/blobs',
    BLOB_SIGNING_SECRET: 'test-secret',
    BLOB_PUBLIC_BASE_URL: 'http://localhost:3001/blobs',
    BLOB_MAX_BYTES: 25 * 1024 * 1024,
    ANTHROPIC_API_KEY: 'ak',
    PORT: 3001,
    HOST: '0.0.0.0',
    LOG_LEVEL: 'error',
    RESEARCH_PROVIDER: 'none',
    RESEARCH_MODEL: 'sonar-deep-research',
    RESEARCH_MAX_ACTIVE_PER_WORKSPACE: 2,
    RESEARCH_MAX_JOBS_PER_DAY: 10,
    RESEARCH_JOB_MAX_MINUTES: 60,
    RESEARCH_SECTION_MODEL: 'sonar-pro',
    RESEARCH_SECTION_MAX_PER_DAY: 20,
    ...overrides,
  } as Env
}

export interface TestHarness {
  app: ReturnType<typeof createApp>
  state: FakeDbState
  auth: AuthProvider
  tokens: Record<string, string>
}

export function createTestApp(
  opts: {
    users?: Array<{ id: string; token: string }>
    env?: Partial<Env>
    storage?: BlobStore
    llm?: LLMProvider
    realtime?: RealtimeBus
    research?: ResearchProvider
    /** 3D's stage 2. Absent means the app's real shaper, which needs a model. */
    shapeResearch?: ShapeResearchFn
    /** Path R's single-section shaper. Absent means the real one — needs a model. */
    shapeSection?: ShapeSectionFn
    /** The planner's two passes. Absent means the real ones, which need a model. */
    ideateThemes?: IdeateThemesFn
    ideateCopy?: IdeateCopyFn
    agentGuard?: AgentConcurrencyGuard
  } = {},
): TestHarness {
  const { db, state } = createFakeDb()
  for (const u of opts.users ?? []) {
    state.users.set(u.id, {
      id: u.id,
      email: `${u.id}@example.com`,
      displayName: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
  }
  const tokens: Record<string, string> = {}
  for (const u of opts.users ?? []) tokens[u.token] = u.id
  const auth = createFakeAuth(tokens)
  const env = testEnv(opts.env)
  const adapters = createFakeAdapters({
    db,
    auth,
    ...(opts.storage ? { storage: opts.storage } : {}),
    ...(opts.llm ? { llm: opts.llm } : {}),
    ...(opts.realtime ? { realtime: opts.realtime } : {}),
    ...(opts.research ? { research: opts.research } : {}),
    ...(opts.agentGuard ? { agentGuard: opts.agentGuard } : {}),
  })
  const app = createApp({
    ...adapters,
    env,
    log: silentLogger(),
    ...(opts.shapeResearch ? { shapeResearch: opts.shapeResearch } : {}),
    ...(opts.shapeSection ? { shapeSection: opts.shapeSection } : {}),
    ...(opts.ideateThemes ? { ideateThemes: opts.ideateThemes } : {}),
    ...(opts.ideateCopy ? { ideateCopy: opts.ideateCopy } : {}),
  })
  return { app, state, auth, tokens }
}
