"use client";

import { isAdmin } from "@brandfactory/shared";
import * as React from "react";

import { useMe } from "@/features/me/hooks";
import { PageState } from "@/components/layout/query-states";

/**
 * Renders its children only for an administrator.
 *
 * **Three states, and the middle one is the point.** Launchpad's note:
 *
 * > *"── Not-yet is not a refusal ───── For the ~1s before `/users/me` lands
 * > there is no answer, and drawing the refusal then would flash *you are not an
 * > administrator* at an administrator on every cold load. It draws nothing
 * > instead."*
 *
 * **And it answers in words rather than a 404.** The nav row is hidden for a
 * non-admin, which is about not *offering* a destination that would refuse.
 * Somebody arriving anyway — a bookmark, a shared link, a demotion that happened
 * this morning — is a different reader, and telling them whose page this is
 * costs nothing and answers the question a 404 leaves open.
 *
 * This is a **rendering** gate. `createAdminMiddleware` on `/members` is the
 * boundary, and it re-checks with the same `isAdmin` — so getting this wrong
 * makes the screen wrong, never the data.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useMe();

  if (isLoading || !me) return null;

  if (!isAdmin(me)) {
    return (
      <PageState>
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">Administrators only</p>
          <p className="mt-2 text-helper text-ink-secondary">
            This page manages who may use Brand Base. Ask an administrator if you need something
            changed.
          </p>
        </div>
      </PageState>
    );
  }

  return <>{children}</>;
}
