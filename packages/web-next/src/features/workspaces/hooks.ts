"use client";

import type { Workspace } from "@brandfactory/shared";
import useSWR from "swr";

import { useAuthState } from "@/auth/store";
import { SCOPES } from "@/lib/api/cache";

import { workspaceService } from "./api";

/**
 * Every workspace the signed-in user can reach.
 *
 * **Keyed on `null` while signed out**, which is how SWR is told not to fetch. `AuthBoundary`
 * already withholds this whole subtree until the session is settled, so this is belt and
 * braces — but the sidebar is the first thing to mount inside the boundary and the cost of
 * being wrong is a 401 on every page load.
 *
 * `revalidateOnFocus: false`: the list changes when somebody creates or deletes a workspace,
 * which is not something that happens while you are looking at another tab. It is also read by
 * every render of the shell header, and a refetch per tab-focus on a value that anchors the
 * whole nav is a refetch nobody asked for.
 */
export function useWorkspaces() {
  const { token } = useAuthState();

  return useSWR<Workspace[]>(token ? [SCOPES.workspaces] : null, () => workspaceService.list(), {
    revalidateOnFocus: false,
  });
}
