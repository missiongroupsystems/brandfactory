import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { SpacesBrowser } from "@/features/spaces/components/spaces-browser";

export const metadata = { title: "Spaces — BrandFactory" };

/** Server shell, interactive half under `<Suspense>` — see the outlets page on why. */
export default function SpacesPage() {
  return (
    <>
      <PageHeader
        title="Spaces"
        description="Planning a unit before it opens. Bring in the landlord's drawing and it becomes a to-scale plan you can lay out, stand inside, pin references to and cost — one set of decisions, four views of it."
      />
      <Suspense fallback={<LoadingRows rows={5} />}>
        <SpacesBrowser />
      </Suspense>
    </>
  );
}
