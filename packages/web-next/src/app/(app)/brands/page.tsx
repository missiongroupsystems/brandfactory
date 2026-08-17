import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { BrandsBrowser } from "@/features/registry-brands/components/brands-browser";

export const metadata = { title: "Brands — BrandFactory" };

/**
 * A **Server Component**, with the interactive half under `<Suspense>` — the shape every list
 * screen here uses, and required rather than stylistic: `BrandsBrowser` reads its filters from
 * `useSearchParams`, which opts its subtree out of static prerendering, and without a boundary
 * Next fails the build outright.
 *
 * Brand was a free-text `String(100)` on `outlet` until 0.15.0, and this page is the reason it
 * stopped being one: a page is reached by id, so `/brands/Casa%20Vostra` would have been a URL
 * whose primary key is a display string — rename the brand and every link to it dies silently.
 */
export default function BrandsPage() {
  return (
    <>
      <PageHeader
        title="Brands"
        description="The names over the doors. A brand is what several premises share, so renaming one here changes it everywhere at once — which a free-text column could never do. Outlets and companies are assigned a brand from their own records, or from a brand's page."
      />
      <Suspense fallback={<LoadingRows rows={5} />}>
        <BrandsBrowser />
      </Suspense>
    </>
  );
}
