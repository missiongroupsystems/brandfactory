import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { ServiceReportsBrowser } from "@/features/service-reports/components/service-reports-browser";

export const metadata = { title: "Servicing & Repairs — Marketing Hub" };

/**
 * A **Server Component** with the interactive half under `<Suspense>` — required rather than
 * stylistic: `ServiceReportsBrowser` reads `?view=` through `useSearchParams`, which opts its
 * subtree out of static prerendering, and Next fails the build outright without a boundary.
 *
 * This page exists because the model was complete and the front door was not. Zero visits and
 * zero reports had been recorded eight days after the area shipped, while the dashboard carried
 * overdue services with no mechanism a person could find to close them — the API asked for a
 * *description of the attendance* before it would take the *document*, and then had nowhere to
 * put the document.
 *
 * Unlike `/contracts`, nothing here is read server-side: `?view=` is a client concern under the
 * boundary, so the route stays static and the redirect cost `/contracts` pays (`ƒ (Dynamic)` on
 * every request) is not paid twice.
 */
export default function ServiceReportsPage() {
  return (
    <>
      <PageHeader
        title="Servicing & Repairs"
        description="What every vendor owes us and the paper they left behind, plus the ad-hoc repair log and its monthly spend. Expected is the worklist; Repairs records a one-off job against an outlet with a photo of the invoice."
      />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <ServiceReportsBrowser />
      </Suspense>
    </>
  );
}
