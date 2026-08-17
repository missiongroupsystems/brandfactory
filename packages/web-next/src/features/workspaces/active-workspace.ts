"use client";

import type { Workspace } from "@brandfactory/shared";

import { createStoredPreference } from "@/lib/stored-preference";
import { LAST_WORKSPACE_KEY, resolveLandingWorkspaceId } from "@/lib/workspace-resolve";

import { useWorkspaces } from "./hooks";

/**
 * The workspace the shell is currently inside.
 *
 * **Resolved, never chosen.** This app has no workspace switcher and no way to create, join or
 * leave one — a person here belongs to exactly one, by product decision, and the row that used
 * to offer the choice came out of the sidebar header with that decision. What survives is the
 * resolution, because it is not optional: brands are workspace-scoped
 * (`GET /workspaces/:workspaceId/brands` is the only list route), so a shell that does not know
 * its workspace cannot ask for brands at all.
 *
 * `select` is therefore gone from the returned shape rather than kept for a caller that no
 * longer exists. The stored key is still *read* — `bf_last_workspace`, which is
 * `packages/web`'s, so a person who does have several there lands in the same one here — and
 * this app simply never writes it. Sharing the key is deliberate: one server, one user, two
 * frontends, and disagreeing about where they were last would be worse than either app alone.
 * Give this hook a setter again only when the product grows a second workspace a person can
 * reach.
 *
 * The name is readable in one place, `components/layout/account-menu.tsx`, as a fact rather
 * than a control.
 */
const stored = createStoredPreference(LAST_WORKSPACE_KEY);

export interface ActiveWorkspace {
  /** The resolved workspace, or `undefined` while the list is in flight or genuinely empty. */
  workspace: Workspace | undefined;
  /** Every workspace the account can reach. Read by nothing today; the resolution's input. */
  workspaces: Workspace[];
  isLoading: boolean;
  error: unknown;
}

export function useActiveWorkspace(): ActiveWorkspace {
  const { data, error, isLoading } = useWorkspaces();
  const storedId = stored.use();

  const workspaces = data ?? [];
  // Derived, never written back — and now never written at all. Correcting the stored value
  // here would be a write during render, the exact pattern `createStoredPreference` exists to
  // avoid.
  const resolvedId = resolveLandingWorkspaceId(workspaces, storedId);
  const workspace = workspaces.find((w) => w.id === resolvedId);

  return { workspace, workspaces, isLoading, error };
}
