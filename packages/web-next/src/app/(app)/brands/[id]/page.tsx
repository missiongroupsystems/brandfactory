import { BrandDetail } from "@/features/brands/components/brand-detail";

/** Same shape as the vendor, contract and outlet detail routes: `params` awaited, no
 * `<Suspense>` needed — nothing here reads `useSearchParams`. */
export default async function BrandDetailPage({ params }: PageProps<"/brands/[id]">) {
  const { id } = await params;
  return <BrandDetail brandId={id} />;
}
