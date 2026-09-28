"use client";

import { useWorkspaceBrands } from "@/features/brands/hooks";
import { useActiveWorkspace } from "@/features/workspaces/active-workspace";
import { LoadingRows, QueryError } from "@/components/layout/query-states";

import { CalendarView } from "./calendar-view";

/**
 * Resolves the workspace and its brands, then hands both to the grid.
 *
 * The brands are needed for the filter row and to name a brand beside each
 * entry — an entry carries a `brandId` and nothing else, because the calendar
 * reads across every brand and duplicating a name onto every row would be a
 * second copy of it on the wire.
 */
export function CalendarScreen() {
  const { workspace, isLoading: wsLoading, error: wsError } = useActiveWorkspace();
  const { data: brands, isLoading, error } = useWorkspaceBrands(workspace?.id);

  if (wsError) return <QueryError error={wsError} />;
  if (error) return <QueryError error={error} />;
  if (wsLoading || isLoading) return <LoadingRows rows={6} />;

  return (
    <CalendarView
      workspaceId={workspace?.id}
      brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))}
    />
  );
}
