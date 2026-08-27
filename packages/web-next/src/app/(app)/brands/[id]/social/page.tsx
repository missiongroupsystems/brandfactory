import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState } from "@/components/layout/query-states";
import { SocialPostsArrival } from "@/features/social-posts/components/social-posts-arrival";

export const metadata = { title: "Social posts — Marketing Hub" };

/**
 * A brand's planned social posts, read-only.
 *
 * The `<Suspense>` boundary is required rather than stylistic: `SocialPostsArrival` reads
 * `?post=` from `useSearchParams` to highlight a funnel click-through, which opts its subtree out
 * of static prerendering — and without a boundary Next fails the build outright.
 *
 * `params` is a Promise and must be awaited (Next 16).
 */
export default async function BrandSocialPage({ params }: PageProps<"/brands/[id]/social"> ) {
  const { id } = await params;
  return (
    <>
      <PageHeader
        title="Social posts"
        description="What this brand has planned, and where each one is going. Written and scheduled in the social calendar, which has not moved to this app yet — so this page reads and does not write."
      />
      <div className="px-6 pb-10">
        <Suspense fallback={<PageState><LoadingRows rows={5} /></PageState>}>
          <SocialPostsArrival brandId={id} />
        </Suspense>
      </div>
    </>
  );
}
