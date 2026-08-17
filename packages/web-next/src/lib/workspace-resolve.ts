import type { Workspace } from "@brandfactory/shared";

/**
 * Which workspace the shell opens in.
 *
 * Ported from `packages/web/src/lib/workspace-context.ts` and `last-workspace.ts`, including
 * the storage key — the two apps run against one server and one user, and disagreeing about
 * where they were last would be a worse experience than either app alone.
 *
 * **Pure, unlike the Vite original.** That one reads `localStorage` inside the resolver, which
 * is untestable without a jsdom global and unusable during SSR. The stored id is a parameter
 * here; reading it is `active-workspace.ts`'s job.
 */

export const LAST_WORKSPACE_KEY = "bf_last_workspace";

/**
 * Last used if it still exists, else the oldest.
 *
 * **"Still exists" is the load-bearing half.** A stored id naming a workspace that has since
 * been deleted — or that belongs to a different user signed in on the same browser — must not
 * resolve, or the shell claims to be somewhere it cannot fetch. Falling through to the oldest
 * is the same rule `packages/web` lands on after sign-in.
 *
 * Oldest rather than newest, and by `createdAt` rather than by list order: the first workspace
 * you made is the one you have been working in, and a route the API happens to return in a
 * different order tomorrow must not move you.
 */
export function resolveLandingWorkspaceId(
  workspaces: Workspace[],
  storedId: string | null,
): string | null {
  if (workspaces.length === 0) return null;
  if (storedId && workspaces.some((w) => w.id === storedId)) return storedId;
  const oldest = [...workspaces].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  return oldest?.id ?? null;
}
