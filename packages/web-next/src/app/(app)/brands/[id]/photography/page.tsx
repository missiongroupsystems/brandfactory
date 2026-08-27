import { PageHeader } from "@/components/layout/page-header";
import { PhotographyView } from "@/features/photography/components/photography-view";

export const metadata = { title: "Photography — Marketing Hub" };

/**
 * A brand's shot library, split by subject with the best of each pinned to the top.
 *
 * No `<Suspense>` boundary: that requirement comes from `useSearchParams`, and this screen keeps
 * its filter in component state rather than in the URL. The subject filter is a reading posture
 * over a list the client holds whole, not a description of what is on screen that a link has to
 * reproduce — the same line `lib/table-density.ts` draws for row height.
 *
 * `params` is a Promise and must be awaited (Next 16).
 */
export default async function BrandPhotographyPage({ params }: PageProps<"/brands/[id]/photography">) {
  const { id } = await params;
  return (
    <>
      <PageHeader
        title="Photography"
        description="The shot library, split by what a picture shows rather than by when it was taken — and with the best of each subject pinned to the top. A pin is a separate mark from the order you drag things into, so unpinning puts a photo back where it was."
      />
      <div className="px-6 pb-10">
        <PhotographyView brandId={id} />
      </div>
    </>
  );
}
