import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";

export const metadata = { title: "Dashboard — Marketing Hub" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What needs attention: overdue obligations, licences approaching expiry, outlets missing required licences, and the licensing readiness of upcoming projects. Filter by outlet or entity — the filtered view is a shareable link."
      />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <DashboardView />
      </Suspense>
    </>
  );
}
