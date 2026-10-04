import type {
  Brand,
  BrandId,
  BrandRole,
  Project,
  ProjectId,
  UserId,
  Workspace,
  WorkspaceId,
} from '@brandfactory/shared'
import { canReadBrand, isAdmin } from '@brandfactory/shared'
import type { User } from '@brandfactory/adapter-auth'
import { AccountDeactivatedError, ForbiddenError, NoAccountError, NotFoundError } from './errors'

// Dependency surface: the narrow slice of `@brandfactory/db`'s query helpers
// we actually call. Keeping the shape explicit lets tests inject fakes
// without importing the real singleton.
//
// Every route already passes `deps.db`, which satisfies this whole interface,
// so growing it costs no call-site change anywhere. That property is why
// Phase C is a small edit rather than an audit of fifty handlers.
export interface AuthzDeps {
  // Branded, to match `@brandfactory/db`'s real signatures — a function taking
  // `UserId` is not assignable to one taking `string`. The handlers hold a bare
  // string from the token, so the cast happens here, once, rather than at every
  // call site.
  getUserById: (id: UserId) => Promise<User | null>
  getWorkspaceById: (id: WorkspaceId) => Promise<Workspace | null>
  getBrandById: (id: BrandId) => Promise<Brand | null>
  getProjectById: (id: ProjectId) => Promise<Project | null>
  getBrandRoleForUser: (userId: UserId, brandId: BrandId) => Promise<BrandRole | null>
}

/**
 * The person behind the id, refused if there is no row or the row is
 * deactivated.
 *
 * ⚠️ **This is the door.** Until Phase C, `verifyToken` created a `users` row
 * for any email it had never seen, and the shared-access model then admitted
 * that row to every workspace, brand and project. The auto-provisioner was the
 * way in — not the open Supabase signup endpoint, which only ever produced a
 * token. A stranger may still obtain a valid token with the public anon key;
 * they reach this function and stop.
 *
 * **Two reads per brand request, and that is the chosen trade.** This runs
 * again inside `requireBrandAccess` rather than threading the row through a
 * return type that fifty call sites destructure. The plan took that over
 * Launchpad's 60-second cache, whose own comment calls the invalidation
 * *"the most dangerous line in this function"* — a missed clear leaves the app
 * refusing after a success. A select of a nine-row table is free; a cache that
 * lies is not.
 */
export async function requireActiveUser(
  userId: string,
  deps: Pick<AuthzDeps, 'getUserById'>,
): Promise<User> {
  const user = await deps.getUserById(userId as UserId)
  if (!user) throw new NoAccountError()
  if (user.deactivatedAt !== null) throw new AccountDeactivatedError()
  return user
}

/**
 * Any active account reaches the workspace.
 *
 * **Per-brand is the dimension that narrows, not per-workspace.** There is one
 * workspace, and an ordinary member has to reach it to reach the brands granted
 * to them through the aggregate chain. `ownerUserId` stays on the row for
 * provenance.
 */
export async function requireWorkspaceAccess(
  userId: string,
  workspaceId: WorkspaceId,
  deps: Pick<AuthzDeps, 'getWorkspaceById' | 'getUserById'>,
): Promise<Workspace> {
  await requireActiveUser(userId, deps)
  const workspace = await deps.getWorkspaceById(workspaceId)
  if (!workspace) throw new NotFoundError('workspace not found', 'WORKSPACE_NOT_FOUND')
  return workspace
}

/**
 * An admin reaches every brand. A member reaches the brands they hold a grant
 * on.
 *
 * ⚠️ **Read access only.** The grant's *role* — `viewer` against `editor` — is
 * recorded and **not** enforced here, because enforcing it means a write gate
 * on every mutating route and that is its own phase. `canWriteBrand` in
 * `@brandfactory/shared` is the rule when that lands. Until then nothing may
 * store a `viewer` grant, so no grant in the table implies a restriction that
 * nothing applies.
 */
export async function requireBrandAccess(
  userId: string,
  brandId: BrandId,
  deps: Pick<
    AuthzDeps,
    'getBrandById' | 'getWorkspaceById' | 'getUserById' | 'getBrandRoleForUser'
  >,
): Promise<{ brand: Brand; workspace: Workspace; user: User; grant: BrandRole | null }> {
  const user = await requireActiveUser(userId, deps)
  const brand = await deps.getBrandById(brandId)
  // **Not-found before forbidden**, so a member cannot learn which brand ids
  // exist by comparing the two refusals.
  if (!brand) throw new NotFoundError('brand not found', 'BRAND_NOT_FOUND')

  const grant = isAdmin(user) ? null : await deps.getBrandRoleForUser(userId as UserId, brandId)
  if (!canReadBrand(user, grant)) throw new ForbiddenError('no access to this brand')

  const workspace = await requireWorkspaceAccess(userId, brand.workspaceId, deps)
  return { brand, workspace, user, grant }
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
