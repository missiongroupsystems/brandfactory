import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { TenanciesView } from "@/features/tenancies/components/tenancies-view";

export const metadata = { title: "Tenancies — BrandFactory" };

export default function TenanciesPage() {
  return (
    <>
      <PageHeader
        title="Tenancies"
        description="The leases behind the doors. An option-to-renew window missed by a day loses the site — here it gets a deadline on the dashboard, the way an auto-renewing contract's notice does."
      />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <TenanciesView />
      </Suspense>
    </>
  );
}
