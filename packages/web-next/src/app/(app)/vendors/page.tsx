import { BookUserIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { Button } from "@/components/ui/button";
import { VendorsView } from "@/features/vendors/components/vendors-view";

export const metadata = { title: "Vendors — BrandFactory" };

/**
 * A **Server Component**, with the interactive half under `<Suspense>` — the shape every
 * list screen here uses, and required rather than stylistic: `VendorsView` reads its
 * filters from `useSearchParams`, which opts its subtree out of static prerendering, and
 * without a boundary Next fails the build outright.
 *
 * Vendors were a tab on `/contracts` until 0.13.0. They are a different noun from the
 * agreements — a company we have a relationship with, rather than one contract with it —
 * and two things needed a page rather than a sheet to link to: a repair names a vendor,
 * and a quotation requires one.
 *
 * **The company half of the Vendors & Contacts directory (E, light).** The header
 * cross-link opens the people half (Contacts, grouped by vendor); both nav items stay
 * until Tuesday decides whether they collapse into one Directory item.
 */
export default function VendorsPage() {
  return (
    <>
      <PageHeader
        title="Vendors"
        description="The companies we buy from, and who to call at each — the company half of the Vendors & Contacts directory. The counts on every row are contract aggregates — how many agreements we hold, how many are live, and how many outlets they cover — so 'is this relationship still active' is answerable without opening anything. The people behind each sit under Contacts, grouped by vendor."
        actions={
          <Button variant="secondary" nativeButton={false} render={<Link href="/contacts" />}>
            <BookUserIcon data-icon="inline-start" />
            Contacts
          </Button>
        }
      />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <VendorsView />
      </Suspense>
    </>
  );
}
