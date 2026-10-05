"use client";

import type {
  CreateMarketingRequestInput,
  MarketingRequest,
  UpdateMarketingRequestInput,
  WorkspacePerson,
} from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { useActiveWorkspace } from "@/features/workspaces/active-workspace";
import { SCOPES, useInvalidate } from "@/lib/api/cache";

import { peopleService, requestService } from "./api";

/**
 * The inbox — the workspace's whole list, one request. The filtering happens in the browser over
 * all of it, which is what lets the status control count each rung truthfully.
 *
 * The key is `null` until the workspace resolves: an array key is truthy however empty its
 * contents, and `[scope, ""]` would fetch `/workspaces//marketing-requests`.
 */
export function useRequests() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useActiveWorkspace();
  const { data, error, isLoading } = useSWR<MarketingRequest[]>(
    workspace?.id ? [SCOPES.bfMarketingRequests, workspace.id] : null,
    () => requestService.list(workspace!.id),
  );
  const requests = React.useMemo(() => data ?? [], [data]);
  return {
    requests,
    isLoading: workspaceLoading || isLoading,
    error: workspaceError ?? error,
  };
}

/**
 * Who a request can be handed to.
 *
 * Its own hook and its own SWR scope, not a slice of the member screen's. The
 * route behind it is `GET /workspaces/:id/people`, which any member may read —
 * `/members` is admin-only by its mount, so a picker reading `bfMembers` would
 * 403 for precisely the people who need the picker.
 *
 * `error` is returned rather than swallowed, because the sheet disables the
 * picker on a failed read and leaves "Assign to me" working: that button needs
 * no list, and taking it away would turn a missing dropdown into no way to pick
 * anything up at all.
 */
export function usePeople() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useActiveWorkspace();
  const { data, error, isLoading } = useSWR<WorkspacePerson[]>(
    workspace?.id ? [SCOPES.bfPeople, workspace.id] : null,
    () => peopleService.list(workspace!.id),
  );
  const people = React.useMemo(() => data ?? [], [data]);
  return {
    people,
    isLoading: workspaceLoading || isLoading,
    error: workspaceError ?? error,
  };
}

/**
 * File a request and change one. Both invalidate the inbox so the list re-renders from the
 * server — nothing optimistic, because the server is the thing allowed to refuse (an outlet from
 * another brand, an assignee with no account).
 */
export function useRequestMutations() {
  const { workspace } = useActiveWorkspace();
  const invalidate = useInvalidate();

  function workspaceId(): string {
    if (!workspace?.id) throw new Error("The workspace has not loaded yet. Try again.");
    return workspace.id;
  }

  return {
    async create(input: CreateMarketingRequestInput) {
      const created = await requestService.create(workspaceId(), input);
      await invalidate(SCOPES.bfMarketingRequests);
      return created;
    },
    async update(id: string, input: UpdateMarketingRequestInput) {
      const updated = await requestService.update(workspaceId(), id, input);
      await invalidate(SCOPES.bfMarketingRequests);
      return updated;
    },
  };
}
