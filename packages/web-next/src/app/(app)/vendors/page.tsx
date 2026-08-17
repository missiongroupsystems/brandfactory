import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { VendorsView } from "@/features/vendors/components/vendors-view";

export const metadata = { title: "Vendors — Marketing Hub" };

/**
 * A **Server Component**, with the interactive half under `<Suspense>` — the shape every
 * list screen here uses, and required rather than stylistic: `VendorsView` reads its
 * filters from `useSearchParams`, which opts its subtree out of static prerendering, and
 * without a boundary Next fails the build outright.
 *
 * Vendors were a tab on `/contracts` until 0.13.0. They are a different noun from the
 * agreements — a company we have a relationship with, rather than one contract with it —
 * and two things needed a page rather than a sheet to link to: a repair names a vendor,
 * and a quotation requires one.
 *
 * **This stopped being half of a "Vendors & Contacts directory", and the cross-link went with
 * the idea.** The header carried a button to `/contacts` described as "the people half"; that
 * was true while Contacts was an address book of the people *at these companies*. The screen it
 * became is a roster of creators engaged for a brand, which is not the same book read from the
 * company side — an agency you hold a talent retainer with is a vendor and appears on this table,
 * and none of the creators is one of its contacts. A button promising the other half of a
 * directory that no longer has two halves is worse than no button.
 *
 * The description below named *"how many outlets they cover"* as the third aggregate, and had
 * done since 1.37.0 took the outlet off a contract. The column beside it counts brands, so the
 * sentence was describing a number this table does not hold — the kind of drift only a reader
 * finds, because no gate can see a string.
 */
export default function VendorsPage() {
  return (
    <>
      <PageHeader
        title="Vendors"
        description="The companies we buy from — agencies, studios, tools and press offices. The counts on every row are contract aggregates: how many agreements we hold, how many are live, and which brands they work on, so 'is this relationship still active' is answerable without opening anything."
      />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <VendorsView />
      </Suspense>
    </>
  );
}
