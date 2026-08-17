import { ContractDetail } from "@/features/contracts/components/contract-detail";

/** Same shape as the outlet detail route: `params` awaited, no `<Suspense>` needed —
 * nothing here reads `useSearchParams`. */
export default async function ContractDetailPage({ params }: PageProps<"/contracts/[id]">) {
  const { id } = await params;
  return <ContractDetail contractId={id} />;
}
