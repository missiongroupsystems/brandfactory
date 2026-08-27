import { PageHeader } from "@/components/layout/page-header";
import { ResourcesView } from "@/features/resources/components/resources-view";

export const metadata = { title: "Resources — Marketing Hub" };

/**
 * This brand's resources — the sites it buys fonts, images, icons and tools from.
 *
 * **Read-only.** No `<Suspense>` boundary is needed here, unlike `brands/[id]/outlets/page.tsx`:
 * `ResourcesView` reads `useResources`, not `useSearchParams`, so nothing here opts the subtree
 * out of static prerendering.
 *
 * `params` is a Promise and must be awaited (Next 16).
 */
export default async function BrandResourcesPage({ params }: PageProps<"/brands/[id]/resources">) {
  const { id } = await params;
  return (
    <>
      <PageHeader
        title="Resources"
        description="The sites this brand buys fonts, images and tools from."
      />
      <div className="px-6 pb-8 md:px-8">
        <ResourcesView brandId={id} />
      </div>
    </>
  );
}
