"use client";

import type { CreateMemberInput, MemberSummary, UpdateMemberInput } from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";

import { memberService } from "./api";

/**
 * Every member, with their grants. **Not workspace-scoped**, because a `users`
 * row is not — the key is `[bf-members]` alone.
 *
 * No pagination and no filters. Launchpad's own comment concedes the honest fix
 * past 200 people is real pagination rather than a bigger number; at nine, one
 * table is the whole answer.
 */
export function useMembers() {
  const { data, error, isLoading } = useSWR<MemberSummary[]>([SCOPES.bfMembers], () =>
    memberService.list(),
  );
  const members = React.useMemo(() => data ?? [], [data]);
  return { members, isLoading, error };
}

/**
 * The writes.
 *
 * **Nothing is optimistic.** The server applies rules this client cannot predict
 * — a duplicate address, the last-admin guard, a password its identity provider
 * refuses — so its answer is the only one worth rendering.
 *
 * **Every write invalidates `me` as well as the list, and that is the one that
 * looks wrong.** It is deliberately outside every other screen's invalidation
 * set, because who you are does not change when you edit a brand. This is the
 * screen where an administrator can edit **their own row** — and `me` is what
 * `AuthBoundary` reads to decide whether to draw the app at all, so a reset that
 * left it stale would leave somebody looking at an app they can no longer use.
 * Launchpad reached the same conclusion for the same reason.
 */
export function useMemberMutations() {
  const invalidate = useInvalidate();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setPending(true);
      try {
        const result = await fn();
        await invalidate(SCOPES.bfMembers, SCOPES.me);
        return result;
      } finally {
        setPending(false);
      }
    },
    [invalidate],
  );

  return {
    pending,
    create: (input: CreateMemberInput) => run(() => memberService.create(input)),
    update: (id: string, input: UpdateMemberInput) => run(() => memberService.update(id, input)),
    resetPassword: (id: string, password: string) =>
      run(() => memberService.resetPassword(id, password)),
    deactivate: (id: string) => run(() => memberService.deactivate(id)),
    reactivate: (id: string) => run(() => memberService.reactivate(id)),
  };
}
