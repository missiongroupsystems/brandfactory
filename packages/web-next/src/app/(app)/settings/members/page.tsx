import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState } from "@/components/layout/query-states";
import { AdminGate } from "@/features/members/components/admin-gate";
import { MembersView } from "@/features/members/components/members-view";

export const metadata = { title: "Members — Brand Base" };

/**
 * Who may use Brand Base, and which brands they reach.
 *
 * **`AdminGate`, which the brand screens deliberately do without.** `GET
 * /members` is admin-only, so a non-admin arriving here would watch every
 * request 403 and read it as a broken page. Launchpad's note on the same choice:
 * a screen whose reads are open can be left to refuse its writes, and one whose
 * reads are closed has to say so instead of rendering an error.
 *
 * Under `<Suspense>` like every other list screen in this package.
 */
export default function MembersPage() {
  return (
    <>
      <PageHeader
        title="Members"
        description="Who may sign in, who administers Brand Base, and which brands each person reaches. Adding somebody creates their account and a first password you send them — they choose their own before they can use anything."
      />
      <Suspense
        fallback={
          <PageState>
            <LoadingRows rows={6} />
          </PageState>
        }
      >
        <AdminGate>
          <MembersView />
        </AdminGate>
      </Suspense>
    </>
  );
}
