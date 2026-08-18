import { OutletDetail } from "@/features/outlets/components/outlet-detail";

export const metadata = { title: "Outlet — Marketing Hub" };

/**
 * One outlet, reached from inside its brand.
 *
 * The same screen `/outlets/[slug]` renders, under the brand's path so the sidebar stays in brand
 * mode while you are reading one of its locations. Clicking a row and watching the whole nav
 * column revert to the workspace would be the navigation losing your place, which is the failure
 * this product exists to fix.
 *
 * `basePath` is what makes the two copies differ at all: the back link, the delete redirect and
 * the cosmetic id→slug rewrite all go to the list you came from rather than to a fixed `/outlets`.
 *
 * *ref* is a readable slug (`casa-vostra`) or a raw uuid, which is what a cross-area link carries.
 * `GET /workspaces/:workspaceId/outlets/:ref` resolves either.
 */
export default async function BrandOutletPage({ params }: PageProps<"/brands/[id]/outlets/[slug]">) {
  const { id, slug } = await params;
  return <OutletDetail outletRef={slug} basePath={`/brands/${id}/outlets`} />;
}
