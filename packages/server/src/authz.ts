import type {
  Brand,
  BrandId,
  Project,
  ProjectId,
  Workspace,
  WorkspaceId,
} from '@brandfactory/shared'
import { NotFoundError } from './errors'

// Dependency surface: the narrow slice of `@brandfactory/db`'s query helpers
// we actually call. Keeping the shape explicit lets tests inject fakes
// without importing the real singleton.
export interface AuthzDeps {
  getWorkspaceById: (id: WorkspaceId) => Promise<Workspace | null>
  getBrandById: (id: BrandId) => Promise<Brand | null>
  getProjectById: (id: ProjectId) => Promise<Project | null>
}

export async function requireWorkspaceAccess(
  userId: string,
  workspaceId: WorkspaceId,
  deps: Pick<AuthzDeps, 'getWorkspaceById'>,
): Promise<Workspace> {
  const workspace = await deps.getWorkspaceById(workspaceId)
  if (!workspace) throw new NotFoundError('workspace not found', 'WORKSPACE_NOT_FOUND')
  // Interim shared-access model: every authenticated user may reach every
  // workspace, and through the aggregate chain (brand → workspace, project →
  // brand → workspace) every brand and project. `ownerUserId` is still written
  // on the row for provenance and for the coming Passport migration, which will
  // reintroduce org membership and per-user permission scopes *here* — this
  // function is the one place the whole app gates aggregate access, so the
  // scoping lands in one edit. `userId` stays in the signature for that reason.
  void userId
  return workspace
}

export async function requireBrandAccess(
  userId: string,
  brandId: BrandId,
  deps: Pick<AuthzDeps, 'getBrandById' | 'getWorkspaceById'>,
): Promise<{ brand: Brand; workspace: Workspace }> {
  const brand = await deps.getBrandById(brandId)
  if (!brand) throw new NotFoundError('brand not found', 'BRAND_NOT_FOUND')
  const workspace = await requireWorkspaceAccess(userId, brand.workspaceId, deps)
  return { brand, workspace }
}

export async function requireProjectAccess(
  userId: string,
  projectId: ProjectId,
  deps: AuthzDeps,
): Promise<{ project: Project; brand: Brand; workspace: Workspace }> {
  const project = await deps.getProjectById(projectId)
  if (!project) throw new NotFoundError('project not found', 'PROJECT_NOT_FOUND')
  const { brand, workspace } = await requireBrandAccess(userId, project.brandId, deps)
  return { project, brand, workspace }
}
