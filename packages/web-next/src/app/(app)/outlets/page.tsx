import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { OutletsBrowser } from "@/features/registry/components/outlets-browser";

/**
 * A **Server Component**, with the interactive half under `<Suspense>`.
 *
 * That split is not decoration. `OutletsBrowser` reads its filters from `useSearchParams`, which
 * opts its subtree out of static prerendering; without a boundary Next fails the build outright
 * ("missing suspense boundary with csr bailout") rather than shipping a page that renders blank
 * until JavaScript arrives. Keeping the header out here means the title and description are still
 * in the prerendered HTML, so the page has an identity before the table has data.
 */
export default function OutletsPage() {
  return (
    <>
      <PageHeader
        title="Outlets"
        description="Every location, open and in the pipeline. A pipeline outlet holds licence requirements with target dates, and that set is the licensing plan for a site that does not exist yet — which is why it is the same record type as an open outlet, not a separate one."
      />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <OutletsBrowser />
      </Suspense>
    </>
  );
}
