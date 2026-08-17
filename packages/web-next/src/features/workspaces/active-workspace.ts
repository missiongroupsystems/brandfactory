"use client";

import type { Workspace } from "@brandfactory/shared";

import { createStoredPreference } from "@/lib/stored-preference";
import { LAST_WORKSPACE_KEY, resolveLandingWorkspaceId } from "@/lib/workspace-resolve";

import { useWorkspaces } from "./hooks";

/**
 * The workspace the shell is currently inside.
 *
 * **A preference, not a route** — the same call `active-brand.ts` made in 1.32.0, and for the
 * same reason: nothing in this shell is workspace-scoped, so there is no `/workspaces/:id` to
 * navigate to and no filter to put in the URL. `packages/web` *does* have those routes and
 * resolves the workspace from the path, with storage only as a fallback; here storage is the
 * whole answer until routes exist to prefer.
 *
 * The key is `bf_last_workspace`, which is `packages/web`'s. Sharing it is deliberate — one
 * server, one user, two frontends, and disagreeing about where they were last would be worse
 * than either app alone.
 *
 * **This is the value the brand row depends on.** Brands are workspace-scoped
 * (`GET /workspaces/:workspaceId/brands` is the only list route), so a shell that does not know
 * its workspace cannot ask for brands at all — which is why this row landed before that one
 * rather than beside it.
 */
const stored = createStoredPreference(LAST_WORKSPACE_KEY);

export interface ActiveWorkspace {
  /** The resolved workspace, or `undefined` while the list is in flight or genuinely empty. */
  workspace: Workspace | undefined;
  /** Every workspace, for the switcher's list. */
  workspaces: Workspace[];
  isLoading: boolean;
  error: unknown;
  select: (id: string) => void;
}

export function useActiveWorkspace(): ActiveWorkspace {
  const { data, error, isLoading } = useWorkspaces();
  const storedId = stored.use();

  const workspaces = data ?? [];
  // Derived, never written back. Correcting the stored value here would be a write during
  // render — the exact pattern `createStoredPreference` exists to avoid — and it corrects
  // itself on the next pick anyway.
  const resolvedId = resolveLandingWorkspaceId(workspaces, storedId);
  const workspace = workspaces.find((w) => w.id === resolvedId);

  return { workspace, workspaces, isLoading, error, select: stored.set };
}
