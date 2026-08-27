import { PageHeader } from "@/components/layout/page-header";
import { DecksView } from "@/features/decks/components/decks-view";

export const metadata = { title: "Decks — Marketing Hub" };

/**
 * This brand's decks — a named folder per pitch deck or one-pager, each with its own version
 * history.
 *
 * **No `<Suspense>` boundary needed**, unlike `brands/[id]/outlets/page.tsx`: `DecksView` reads
 * `useDecks`, not `useSearchParams`, so nothing here opts the subtree out of static prerendering —
 * the same reasoning `brands/[id]/resources/page.tsx` states for itself.
 *
 * `params` is a Promise and must be awaited (Next 16).
 */
export default async function BrandDecksPage({ params }: PageProps<"/brands/[id]/decks">) {
  const { id } = await params;
  return (
    <>
      <PageHeader
        title="Decks"
        description="The pitch decks and one-pagers this brand presents, and every version of each."
      />
      <div className="px-6 pb-8 md:px-8">
        <DecksView brandId={id} />
      </div>
    </>
  );
}
