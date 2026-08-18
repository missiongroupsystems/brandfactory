import { PageHeader } from "@/components/layout/page-header";
import { BrandsGallery } from "@/features/brands/components/brands-gallery";

export const metadata = { title: "Brands — Marketing Hub" };

/**
 * The workspace's brands, and the door into each one.
 *
 * **The plural finally means what it says.** `/brands` was claimed by the Operations Hub's
 * outlet-brand registry until 1.33.1 moved that to `/registry-brands`, and then sat unused for
 * four releases while `/brand` and `/brand/:id` rendered the profile of whichever brand a
 * `localStorage` preference named. Both of those routes are gone; a brand is `/brands/:id`, which
 * is the shape `packages/web` has always had, and the two apps now agree.
 *
 * **No `<Suspense>` here**, unlike every list screen in this app. Those need one because they read
 * `useSearchParams`, which opts a subtree out of static prerendering. This page has no filters —
 * see `BrandsGallery` for why a workspace of six brands does not get a filter row.
 */
export default function BrandsPage() {
  return (
    <>
      <PageHeader
        title="Brands"
        description="Every brand in this workspace. Open one to work inside it — the profile, and the outlets that belong to it. Everything else in the nav spans all of them."
      />
      <BrandsGallery />
    </>
  );
}
