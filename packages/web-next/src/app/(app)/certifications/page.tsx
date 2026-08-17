import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { CertificationsView } from "@/features/certifications/components/certifications-view";

/**
 * The certifications area — a **mock façade** (F1 of the 2026-08-13 worklist, no backend).
 *
 * No `<Suspense>`: the view reads `useOutletIndex` (SWR), not `useSearchParams`, so nothing
 * opts the subtree out of prerendering. The "Mock" badge in the header and the persistent
 * banner inside the view are what keep this from reading as a finished feature.
 */
export default function CertificationsPage() {
  return (
    <>
      <PageHeader
        title="Certifications"
        description="The qualifications your people hold — a food hygiene officer, a fire safety manager, a first aider — behind each outlet's requirements. Distinct from the premises licences under Licences: this is who is trained, not what the building is permitted to do."
        actions={<Badge variant="outline">Mock · Phase 3</Badge>}
      />
      <CertificationsView />
    </>
  );
}
