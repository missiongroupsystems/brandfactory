import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { QuotationsView } from "@/features/quotations/components/quotations-view";

export const metadata = { title: "Quotations — Marketing Hub" };

/**
 * The quotations area — a **mock façade** (F2 of the 2026-08-13 worklist, no backend).
 *
 * No `<Suspense>`: the view is a Server Component reading a static fixture, not
 * `useSearchParams`, so nothing opts the subtree out of prerendering. The "Mock" badge in the
 * header and the persistent banner inside the view are what keep this from reading as a
 * finished feature.
 */
export default function QuotationsPage() {
  return (
    <>
      <PageHeader
        title="Quotations"
        description="Priced proposals from vendors, before they become agreements — the quote you asked three companies for, moving through sent and accepted. A preview to get Tuesday's feedback on the flow; nothing here is stored or linked yet."
        actions={<Badge variant="outline">Mock · Phase 3</Badge>}
      />
      <QuotationsView />
    </>
  );
}
