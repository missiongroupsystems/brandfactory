import { HandshakeIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { Button } from "@/components/ui/button";
import { ContactsBrowser } from "@/features/contacts/components/contacts-browser";

export const metadata = { title: "Influencers — Marketing Hub" };

/**
 * Server shell, interactive half under `<Suspense>` — see the outlets page on why.
 *
 * **Renamed from "Contacts"; the route and the screen beneath it are unchanged.** This is
 * still the contacts browser, grouped by the company each person sits under. The label moved
 * ahead of the model on purpose — the noun BrandFactory works with is the person you partner
 * with — and the data shape follows when the screen is rebuilt around it. Until then the
 * cross-link to Vendors stays, because that is genuinely the same book read from the company
 * side.
 */
export default function ContactsPage() {
  return (
    <>
      <PageHeader
        title="Influencers"
        description="The people behind each partnership — grouped under the company they sit with, filterable by trade, with independents under “No vendor”. The companies themselves live on the Vendors page."
        actions={
          <Button variant="secondary" nativeButton={false} render={<Link href="/vendors" />}>
            <HandshakeIcon data-icon="inline-start" />
            Vendors
          </Button>
        }
      />
      <Suspense fallback={<LoadingRows rows={4} />}>
        <ContactsBrowser />
      </Suspense>
    </>
  );
}
