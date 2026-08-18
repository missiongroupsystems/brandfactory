import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState } from "@/components/layout/query-states";
import { LicensesBrowser } from "@/features/licenses/components/licenses-browser";

export const metadata = { title: "Licences — Marketing Hub" };

/**
 * Server page + client browser under `<Suspense>`, like every list screen here: the
 * browser reads its view and filters from `useSearchParams`, and without the boundary
 * Next fails the build rather than shipping a blank-until-JS page.
 */
export default function LicensesPage() {
  return (
    <>
      <PageHeader
        title="Licences"
        description="What we hold, what each site needs, and the Singapore licence library behind both. The library is advisory; a held licence is authoritative — where the two disagree the app shows a human both figures and never silently overwrites either side."
      />
      <Suspense fallback={<PageState><LoadingRows rows={6} /></PageState>}>
        <LicensesBrowser />
      </Suspense>
    </>
  );
}
