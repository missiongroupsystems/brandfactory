import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState } from "@/components/layout/query-states";
import { OutletsBrowser } from "@/features/outlets/components/outlets-browser";
import { SyncOutletsButton } from "@/features/outlets/components/sync-outlets-button";

export const metadata = { title: "Outlets — Marketing Hub" };

/**
 * This brand's outlets.
 *
 * A **Server Component**, with the interactive half under `<Suspense>` — required rather than
 * stylistic: `OutletsBrowser` reads its filters from `useSearchParams`, which opts its subtree out
 * of static prerendering, and without a boundary Next fails the build outright.
 *
 * **The scope is the route, not a filter the reader set.** Passing `brandId` takes the Brand
 * column, the brand filter and the "By brand" grouping off the screen — a column of one repeated
 * value is furniture, and a filter that cannot be cleared is a lie about being a filter. The
 * workspace-wide table still exists at `/outlets` for the cross-area links that reach an outlet
 * from a screen that knows an outlet id and no brand; it is simply no longer a door in the nav.
 *
 * `params` is a Promise and must be awaited (Next 16).
 */
export default async function BrandOutletsPage({ params }: PageProps<"/brands/[id]/outlets">) {
  const { id } = await params;
  return (
    <>
      <PageHeader
        title="Outlets"
        description="This brand's locations, open and in the pipeline. A site that has not opened yet is the same kind of record as one that is trading — it has an address and a target date, and none of that waits for the doors."
        actions={<SyncOutletsButton />}
      />
      <Suspense fallback={<PageState><LoadingRows rows={6} /></PageState>}>
        <OutletsBrowser brandId={id} />
      </Suspense>
    </>
  );
}
