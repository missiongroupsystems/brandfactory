import { TenancyDetail } from "@/features/tenancies/components/tenancy-detail";

/** Same shape as the contract detail route: `params` awaited, no `<Suspense>` — nothing here
 * reads `useSearchParams`. */
export default async function TenancyDetailPage({ params }: PageProps<"/tenancies/[id]">) {
  const { id } = await params;
  return <TenancyDetail tenancyId={id} />;
}
