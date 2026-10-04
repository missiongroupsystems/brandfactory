import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState } from "@/components/layout/query-states";
import { MarketingRequestsView } from "@/features/marketing-requests/components/requests-view";

export const metadata = { title: "Marketing Requests — Brand Base" };

/**
 * Marketing Requests — **an inbox first**. What the business has asked marketing for, newest at
 * the top, with the request form behind a button.
 *
 * **Real as of MKT-5 Phase 2.** The rows come from the Hono server, a request is filed under the
 * signed-in user, and nothing here is a sample any more. The view reads its filters from the
 * URL, so it renders under `<Suspense>` like every other list screen.
 */
export default function MarketingRequestsPage() {
  return (
    <>
      <PageHeader
        title="Marketing Requests"
        description="What the business is asking marketing for — a post, a campaign, artwork, signage, a shoot. Each one names its brand, who asked, how urgent it is and when it is needed, and moves from New to In progress to Completed, or to Declined. Take one with Assign to me."
      />
      <Suspense
        fallback={
          <PageState>
            <LoadingRows rows={6} />
          </PageState>
        }
      >
        <MarketingRequestsView />
      </Suspense>
    </>
  );
}
