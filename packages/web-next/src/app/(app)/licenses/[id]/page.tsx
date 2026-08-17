import { LicenseDetail } from "@/features/licenses/components/license-detail";

/** Same shape as the contract and tenancy detail routes: `params` awaited, no `<Suspense>` —
 * nothing here reads `useSearchParams`. */
export default async function LicenseDetailPage({ params }: PageProps<"/licenses/[id]">) {
  const { id } = await params;
  return <LicenseDetail licenseId={id} />;
}
