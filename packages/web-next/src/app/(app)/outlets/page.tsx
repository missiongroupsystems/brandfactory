import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState } from "@/components/layout/query-states";
import { OutletsBrowser } from "@/features/outlets/components/outlets-browser";
import { SyncOutletsButton } from "@/features/outlets/components/sync-outlets-button";

/**
 * A **Server Component**, with the interactive half under `<Suspense>`.
 *
 * That split is not decoration. `OutletsBrowser` reads its filters from
 * `useSearchParams`, which opts its subtree out of static prerendering; without a
 * boundary Next fails the build outright ("missing suspense boundary with csr
 * bailout") rather than shipping a page that renders blank until JavaScript
 * arrives. Keeping the header out here means the title, the description and the
 * primary action are in the prerendered HTML, so the page has an identity before
 * the table has data.
 *
 * The action in the header is the **sync**, and the create sits in the toolbar
 * below as a secondary — see `SyncOutletsButton` for why the placeholder is a
 * live button rather than a disabled one.
 */
export default function OutletsPage() {
  return (
    <>
      <PageHeader
        title="Outlets"
        description="Every location, open and in the pipeline. A site that has not opened yet is the same kind of record as one that is trading — it has an address, a brand and a target date, and none of that waits for the doors."
        actions={<SyncOutletsButton />}
      />
      <Suspense fallback={<PageState><LoadingRows rows={6} /></PageState>}>
        <OutletsBrowser />
      </Suspense>
    </>
  );
}
