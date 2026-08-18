import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState } from "@/components/layout/query-states";
import { TenanciesView } from "@/features/tenancies/components/tenancies-view";

export const metadata = { title: "Tenancies — Marketing Hub" };

export default function TenanciesPage() {
  return (
    <>
      <PageHeader
        title="Tenancies"
        description="The leases behind the doors. An option-to-renew window missed by a day loses the site — here it gets a deadline on the dashboard, the way an auto-renewing contract's notice does."
      />
      <Suspense fallback={<PageState><LoadingRows rows={6} /></PageState>}>
        <TenanciesView />
      </Suspense>
    </>
  );
}
