import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState } from "@/components/layout/query-states";
import { BrandsBrowser } from "@/features/registry-brands/components/brands-browser";

export const metadata = { title: "Outlet brands — Marketing Hub" };

/**
 * A **Server Component**, with the interactive half under `<Suspense>` — the shape every list
 * screen here uses, and required rather than stylistic: `BrandsBrowser` reads its filters from
 * `useSearchParams`, which opts its subtree out of static prerendering, and without a boundary
 * Next fails the build outright.
 *
 * Brand was a free-text `String(100)` on `outlet` until 0.15.0, and this page is the reason it
 * stopped being one: a page is reached by id, so `/registry-brands/Casa%20Vostra` would have been
 * a URL whose primary key is a display string — rename the brand and every link to it dies
 * silently.
 *
 * **The route is `/registry-brands`, not `/brands`, and the rename is the point.** This is the
 * Operations Hub's third registry dimension — the brand an *outlet* belongs to — and it held the
 * plain word until BrandFactory's own Brand needed it. 1.33.0 renamed the feature folder for
 * exactly that reason and stopped at the folder, which left the product's most important noun
 * pointing at a page about premises. The folder, the cache scope and the route now agree.
 * `features/registry-brands/api.ts` still calls `/brands` on the wire: that is the Ops backend's
 * path, frozen in `schema.d.ts`, and it is not this app's to rename.
 */
export default function BrandsPage() {
  return (
    <>
      <PageHeader
        title="Outlet brands"
        description="The names over the doors. A brand is what several premises share, so renaming one here changes it everywhere at once — which a free-text column could never do. Outlets and companies are assigned a brand from their own records, or from a brand's page."
      />
      <Suspense fallback={<PageState><LoadingRows rows={5} /></PageState>}>
        <BrandsBrowser />
      </Suspense>
    </>
  );
}
