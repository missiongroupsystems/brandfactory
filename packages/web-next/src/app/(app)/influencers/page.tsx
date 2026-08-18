import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { InfluencersBrowser } from "@/features/influencers/components/influencers-browser";

export const metadata = { title: "Influencers — Marketing Hub" };

/**
 * Server shell, interactive half under `<Suspense>` — see the outlets page on why.
 *
 * **The route moved with the screen.** This was `/contacts`, the Operations Hub's address book,
 * relabelled "Influencers" in the nav while the model underneath it stayed a contact filed under
 * a vendor. The label went first on the argument that the noun should lead and the data would
 * follow; the data has followed, so folder, route, cache scope and wire path all say
 * `influencers` now — the rule `/registry-brands` cost a release to learn.
 *
 * **And the data is real as of this release.** The rows come from
 * `GET /workspaces/:id/influencers` on the Hono server rather than from a fixture, so the tier
 * bands' counts are totals and the roster is whatever somebody put in the table.
 *
 * `/contacts` is *not* redirected here, and that is deliberate. It is a live Operations Hub path
 * that still means the address book: `useContactMutations` is called by the tenancy intake sheet
 * and the review queue, both of which create a contact against a vendor. A redirect would claim
 * the two screens were the same one under two names, which is exactly the confusion this move
 * exists to end.
 *
 * There is no cross-link to Vendors any more. That button read "the same book from the company
 * side", which was true of an address book and is not true of a roster — an agency you hold a
 * retainer with is a vendor, and a creator you engage for a brand is not one of its contacts.
 */
export default function InfluencersPage() {
  return (
    <>
      <PageHeader
        title="Influencers"
        description="The creators each brand works with — grouped by how far they reach, filterable by brand, vertical and platform."
      />
      <Suspense fallback={<LoadingRows rows={4} />}>
        <InfluencersBrowser />
      </Suspense>
    </>
  );
}
