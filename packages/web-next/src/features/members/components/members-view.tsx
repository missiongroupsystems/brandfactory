"use client";

import { isAdmin, type MemberSummary } from "@brandfactory/shared";
import { KeyRoundIcon, PencilIcon, UserMinusIcon, UserPlusIcon } from "lucide-react";
import * as React from "react";

import { useMe } from "@/features/me/hooks";
import { useActiveWorkspace } from "@/features/workspaces/active-workspace";
import { useWorkspaceBrands } from "@/features/brands/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingRows, PageState, QueryError } from "@/components/layout/query-states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useMemberMutations, useMembers } from "../hooks";
import {
  MEMBER_STATUS_LABEL,
  accessSummary,
  isLastActiveAdmin,
  memberStatus,
  rowActions,
  sortMembers,
} from "../model";
import { DeactivateDialog } from "./deactivate-dialog";
import { MemberForm } from "./member-form";
import { SetPasswordDialog } from "./set-password-dialog";

/**
 * Who may use Brand Base.
 *
 * **One table. No pagination, no filters, no search.** Launchpad's equivalent
 * caps at 200 rows and narrows four dimensions in memory, and its own comment
 * concedes the honest fix past 200 is real pagination rather than a bigger
 * number. At nine people none of that apparatus has a job.
 *
 * **Row actions are hidden, not disabled**, and each is suppressed where the
 * server would refuse — computed from the row, never attempted. `model.ts` holds
 * those rules so they can be asserted without a renderer.
 */
export function MembersView() {
  const { members, isLoading, error } = useMembers();
  const { data: me } = useMe();
  const { workspace } = useActiveWorkspace();
  const { data: brands } = useWorkspaceBrands(workspace?.id);
  const mutations = useMemberMutations();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MemberSummary | undefined>(undefined);
  const [resetting, setResetting] = React.useState<MemberSummary | undefined>(undefined);
  const [deactivating, setDeactivating] = React.useState<MemberSummary | undefined>(undefined);

  // The viewer's own member row, which carries the grants `me` does not.
  const viewer = React.useMemo(() => members.find((m) => m.id === me?.id), [members, me?.id]);
  const rows = React.useMemo(() => sortMembers(members), [members]);

  if (error) {
    return (
      <PageState>
        <QueryError error={error} />
      </PageState>
    );
  }
  if (isLoading) {
    return (
      <PageState>
        <LoadingRows rows={6} />
      </PageState>
    );
  }

  // `me` is an admin by the time this screen renders — the route refuses anybody
  // else — so the add control is unconditional rather than computed.
  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex justify-end">
        <Button onClick={openCreate}>Add member</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="Nobody yet" hint="Add the first member to get started." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const actions = rowActions(viewer, row);
              const status = memberStatus(row);
              const last = isLastActiveAdmin(members, row);
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-ink">{row.displayName ?? row.email}</span>
                      {row.displayName ? (
                        <span className="text-helper text-ink-tertiary">{row.email}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-ink-secondary">{accessSummary(row)}</span>
                      {isAdmin(row) ? (
                        <span className="text-helper text-ink-tertiary">Administrator</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* The words carry the meaning; the colour only agrees with
                        them. `warning` for a temporary password because it is a
                        state to clear, not a fault. */}
                    <Badge
                      variant={
                        status === "deactivated"
                          ? "error"
                          : status === "temporary-password"
                            ? "warning"
                            : "success"
                      }
                    >
                      {MEMBER_STATUS_LABEL[status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {actions.canEdit ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${row.email}`}
                          onClick={() => {
                            setEditing(row);
                            setFormOpen(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                      ) : null}
                      {actions.canResetPassword ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Set a password for ${row.email}`}
                          onClick={() => setResetting(row)}
                        >
                          <KeyRoundIcon />
                        </Button>
                      ) : null}
                      {row.deactivatedAt !== null ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Reactivate ${row.email}`}
                          disabled={mutations.pending}
                          onClick={() => void mutations.reactivate(row.id)}
                        >
                          <UserPlusIcon />
                        </Button>
                      ) : actions.canDeactivate && !last ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Deactivate ${row.email}`}
                          onClick={() => setDeactivating(row)}
                        >
                          <UserMinusIcon />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <MemberForm
        open={formOpen}
        onOpenChange={setFormOpen}
        member={editing}
        brands={brands ?? []}
        viewerId={me?.id}
        // True wherever an identity provider holds passwords, which is every
        // deployment but local dev. The server refuses a create with no
        // password there and accepts one without on the dev provider, so an
        // over-eager `true` here produces a form field the server ignores
        // rather than a failure.
        holdsPasswords
        pending={mutations.pending}
        onSubmit={async (input) => {
          if (editing) {
            await mutations.update(editing.id, {
              displayName: input.displayName,
              role: input.role,
              brands: input.brands,
            });
          } else {
            // `password` is present on a create; the schema makes it optional
            // for the provider that holds none.
            await mutations.create(input);
          }
        }}
      />

      <SetPasswordDialog
        member={resetting}
        onOpenChange={(open) => !open && setResetting(undefined)}
        pending={mutations.pending}
        onSubmit={async (id, password) => {
          await mutations.resetPassword(id, password);
        }}
      />

      <DeactivateDialog
        member={deactivating}
        onOpenChange={(open) => !open && setDeactivating(undefined)}
        pending={mutations.pending}
        onConfirm={async (id) => {
          await mutations.deactivate(id);
        }}
      />
    </div>
  );
}
