import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { OrgChartBoard } from "@/features/registry/components/org-chart-board";

export const metadata = { title: "Org chart — BrandFactory" };

/** Server shell, interactive half under `<Suspense>` — see the outlets page on why. */
export default function OrgChartPage() {
  return (
    <>
      {/* One description for both boards, rather than one read off `?by=`: `AGENTS.md` is
          explicit that awaiting `searchParams` in a server page makes the whole route dynamic
          for every request, and a heading that rewrites itself is not worth that. */}
      <PageHeader
        title="Org chart"
        description="Which company holds which outlet, and which brand each trades under — the same estate grouped two ways. Neither link is a required one: a pipeline project exists before anyone decides which company will run it, and a one-off site carries no brand at all, so this page shows those states rather than hiding them."
      />
      <Suspense fallback={<LoadingRows rows={4} />}>
        <OrgChartBoard />
      </Suspense>
    </>
  );
}
