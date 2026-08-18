import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState } from "@/components/layout/query-states";
import { VendorsBrowser } from "@/features/vendors/components/vendors-browser";

export const metadata = { title: "Vendors — Marketing Hub" };

/**
 * A **Server Component**, with the interactive half under `<Suspense>` — the shape every list
 * screen here uses, and required rather than stylistic: `VendorsBrowser` reads its filters from
 * `useSearchParams`, which opts its subtree out of static prerendering, and without a boundary
 * Next fails the build outright.
 *
 * **The rows are real as of this release, and the screen can fill its own table.** They come from
 * `GET /workspaces/:id/vendors` on the Hono server rather than from `fixtures/agencies.ts` and
 * `fixtures/contracts.ts`, so the book is whatever somebody put in the table and the footer's
 * count is a total. `New vendor` writes to it; the `Upload` half of that button is still the
 * stated placeholder it has always been.
 *
 * **`/vendors/[slug]` is this feature's page as of Phase E**, so the name cell in the table is a
 * link and the segment carries a readable slug. It was `[id]` over the Operations Hub's screen
 * until that swap.
 *
 * **Two vendor books are on screen at once until the contracts conversion closes it.** This one
 * holds the workspace's companies; `/contracts` still names the nine the fixtures invented, by
 * *their* ids. That is an accepted cost the plan states, and the honesty it owes is a `Sample`
 * tag on the Contracts nav item.
 *
 * **This stopped being half of a "Vendors & Contacts directory", and the cross-link went with
 * the idea.** The header carried a button to `/contacts` described as "the people half"; that
 * was true while Contacts was an address book of the people *at these companies*. The screen it
 * became is a roster of creators engaged for a brand, which is not the same book read from the
 * company side.
 */
export default function VendorsPage() {
  return (
    <>
      <PageHeader
        title="Vendors"
        description="The companies we buy from — agencies, studios, tools and press offices. Each row states which brands the company works on, who to call there and whether we are still buying from them."
      />
      <Suspense fallback={<PageState><LoadingRows rows={6} /></PageState>}>
        <VendorsBrowser />
      </Suspense>
    </>
  );
}
