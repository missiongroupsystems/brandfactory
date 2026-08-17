import { VendorDetail } from "@/features/vendors/components/vendor-detail";

/** Same shape as the contract and outlet detail routes: `params` awaited, no `<Suspense>`
 * needed — nothing here reads `useSearchParams`. */
export default async function VendorDetailPage({ params }: PageProps<"/vendors/[id]">) {
  const { id } = await params;
  return <VendorDetail vendorId={id} />;
}
