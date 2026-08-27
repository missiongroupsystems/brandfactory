import { PageHeader } from "@/components/layout/page-header";
import { FunnelView } from "@/features/funnel/components/funnel-view";

export const metadata = { title: "Marketing funnel — Marketing Hub" };

/**
 * A brand's user journey, stage by stage.
 *
 * `params` is a Promise and must be awaited (Next 16).
 */
export default async function BrandFunnelPage({ params }: PageProps<"/brands/[id]/funnel">) {
  const { id } = await params;
  return (
    <>
      <PageHeader
        title="Marketing funnel"
        description="The journey into this brand, stage by stage — which platforms serve each step, and what is actually running there now. Status here is tracking rather than performance: the platforms themselves measure that."
      />
      <div className="px-6 pb-10">
        <FunnelView brandId={id} />
      </div>
    </>
  );
}
