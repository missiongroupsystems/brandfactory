import { PageHeader } from "@/components/layout/page-header";
import { MarketingRequestsView } from "@/features/marketing-requests/components/requests-view";

export const metadata = { title: "Marketing Requests — Marketing Hub" };

/**
 * Marketing Requests — **an inbox first**. What the business has asked marketing for, newest at
 * the top, with the request form behind a button and a public link anyone can fill without an
 * account.
 *
 * **Was `/forms`, and was "Ops Forms".** Two forms became one — the incident report was an
 * operations safety record with no marketing reading of it — and the screen turned around: the
 * blank form used to be the page and the submissions a tab behind it, which is backwards for
 * the one person this product is for.
 *
 * No `<Suspense>`: this view keeps its filters in local state and reads no `useSearchParams`.
 * The reason it may, and when that has to change, is in the view's own note.
 */
export default function MarketingRequestsPage() {
  return (
    <>
      <PageHeader
        title="Marketing Requests"
        description="What the business is asking marketing for — a post, a campaign, artwork, signage, a shoot. Each one arrives with who asked, which outlet, how urgent it is and when it is needed, and moves from New to In progress to Completed as you work it. Share the public link and anyone can raise one without an account."
      />
      <MarketingRequestsView />
    </>
  );
}
