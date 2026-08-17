import { PageHeader } from "@/components/layout/page-header";
import { FormsView } from "@/features/forms/components/forms-view";

export const metadata = { title: "Ops Forms — BrandFactory" };

/**
 * Ops Forms — two send-and-collect forms, **wired**: they submit to a `form_submission` table and
 * each can be shared as a public `/f/<slug>` form anyone fills without logging in. No form builder
 * yet (a Launchpad concern). No `<Suspense>`: `FormsView` reads no `useSearchParams`.
 */
export default function FormsPage() {
  return (
    <>
      <PageHeader
        title="Ops Forms"
        description="Structured forms Ops sends out and collects back — an Ops request, an incident report — each with an inbox, and a public share link anyone can fill without logging in."
      />
      <FormsView />
    </>
  );
}
