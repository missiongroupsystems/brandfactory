import type {
  BrandId,
  Canvas,
  Project,
  ProjectId,
  ProjectSummary,
  WorkspaceId,
} from '@brandfactory/shared'
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { rowToCanvas, rowToProject, rowToProjectSummary } from '../mappers'
import { brands, canvasBlocks, canvases, projects } from '../schema'

export type CreateProjectInput =
  | { kind: 'freeform'; brandId: BrandId; name: string }
  | { kind: 'standardized'; brandId: BrandId; name: string; templateId: string }

export async function getProjectById(id: ProjectId): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.id, id))
  return row ? rowToProject(row) : null
}

export async function listProjectsByBrand(brandId: BrandId): Promise<Project[]> {
  const rows = await db.select().from(projects).where(eq(projects.brandId, brandId))
  return rows.map(rowToProject)
}

// D1: true last activity = greatest of project.updated_at, newest agent
// message, and newest canvas event on the project's canvas. Correlated
// subqueries keep the fan-out out of the main join; coalesce falls back to
// updated_at so idle projects still sort stably.
//
// Defined once and shared by every project-summary surface. `projects.updatedAt`
// only moves when the row itself changes (a rename), so any list that renders
// this value under an "activity" label must source it from here — see the
// D1 rationale in the Phase 9 plan.
const lastActivityAt = sql<string | Date>`greatest(
  ${projects.updatedAt},
  coalesce(
    (select max(am.created_at) from agent_messages am
      where am.project_id = ${projects.id}),
    ${projects.updatedAt}
  ),
  coalesce(
    (select max(ce.created_at) from canvas_events ce
      join canvases c on c.id = ce.canvas_id
     where c.project_id = ${projects.id}),
    ${projects.updatedAt}
  )
)`

const projectSummaryColumns = {
  id: projects.id,
  brandId: projects.brandId,
  kind: projects.kind,
  templateId: projects.templateId,
  name: projects.name,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  brandName: brands.name,
  lastActivityAt,
}

// Recent-work strip for the workspace home — spans every brand in the workspace.
export async function listRecentProjectsByWorkspace(
  workspaceId: WorkspaceId,
  limit: number,
): Promise<ProjectSummary[]> {
  const rows = await db
    .select(projectSummaryColumns)
    .from(projects)
    .innerJoin(brands, eq(brands.id, projects.brandId))
    .where(eq(brands.workspaceId, workspaceId))
    .orderBy(desc(lastActivityAt))
    .limit(limit)

  return rows.map(rowToProjectSummary)
}

// Projects grid on the brand hub. Same shape and same activity definition as
// the workspace strip so one `ProjectCard` cannot mean two different things.
export async function listProjectSummariesByBrand(brandId: BrandId): Promise<ProjectSummary[]> {
  const rows = await db
    .select(projectSummaryColumns)
    .from(projects)
    .innerJoin(brands, eq(brands.id, projects.brandId))
    .where(eq(projects.brandId, brandId))
    .orderBy(desc(lastActivityAt))

  return rows.map(rowToProjectSummary)
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const [row] = await db
    .insert(projects)
    .values({
      brandId: input.brandId,
      kind: input.kind,
      name: input.name,
      templateId: input.kind === 'standardized' ? input.templateId : null,
    })
    .returning()
  if (!row) throw new Error('createProject returned no row')
  return rowToProject(row)
}

export async function updateProject(
  id: ProjectId,
  input: { name: string },
): Promise<Project | null> {
  const [row] = await db
    .update(projects)
    .set({ name: input.name, updatedAt: sql`now()` })
    .where(eq(projects.id, id))
    .returning()
  return row ? rowToProject(row) : null
}

// Cascades canvas → blocks / events / agent_messages via FK onDelete.
// Blobs referenced by those blocks live in object storage, outside the FK
// graph — callers must collect `listBlobKeysByProject` *before* deleting and
// sweep them, or the bytes are orphaned forever.
export async function deleteProject(id: ProjectId): Promise<Project | null> {
  const [row] = await db.delete(projects).where(eq(projects.id, id)).returning()
  return row ? rowToProject(row) : null
}

// Storage keys held by every block on this project's canvas. Read before the
// row delete cascades them away.
export async function listBlobKeysByProject(projectId: ProjectId): Promise<string[]> {
  const rows = await db
    .select({ blobKey: canvasBlocks.blobKey })
    .from(canvasBlocks)
    .innerJoin(canvases, eq(canvases.id, canvasBlocks.canvasId))
    .where(and(eq(canvases.projectId, projectId), isNotNull(canvasBlocks.blobKey)))
  return rows.map((r) => r.blobKey).filter((k): k is string => k !== null)
}

// Atomic project + canvas creation. Projects carry a 1:1 canvas, so the
// invariant lives in one transaction — half-creating leaves no orphan row
// for Phase 6's agent or the HTTP route to trip over.
export async function createProjectWithCanvas(
  input: CreateProjectInput,
): Promise<{ project: Project; canvas: Canvas }> {
  return db.transaction(async (tx) => {
    const [projectRow] = await tx
      .insert(projects)
      .values({
        brandId: input.brandId,
        kind: input.kind,
        name: input.name,
        templateId: input.kind === 'standardized' ? input.templateId : null,
      })
      .returning()
    if (!projectRow) throw new Error('createProjectWithCanvas: project insert returned no row')
    const [canvasRow] = await tx.insert(canvases).values({ projectId: projectRow.id }).returning()
    if (!canvasRow) throw new Error('createProjectWithCanvas: canvas insert returned no row')
    return { project: rowToProject(projectRow), canvas: rowToCanvas(canvasRow) }
  })
}
