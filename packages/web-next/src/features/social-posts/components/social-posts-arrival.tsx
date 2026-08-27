"use client";

import { useSearchParams } from "next/navigation";

import { SocialPostsView } from "./social-posts-view";

/**
 * Reads `?post=` and hands it to the view as the row to mark.
 *
 * Its own component because `useSearchParams` opts a subtree out of static prerendering, and the
 * page keeps its `PageHeader` on the server — the split every list screen in this package makes.
 */
export function SocialPostsArrival({ brandId }: { brandId: string }) {
  const params = useSearchParams();
  return <SocialPostsView brandId={brandId} highlightId={params.get("post") ?? undefined} />;
}
