import { Suspense } from "react";

import { LoadingRows } from "@/components/layout/query-states";
import { SchemeWorkspace } from "@/features/spaces/components/workspace";

/**
 * The scheme workspace. `params` awaited like every detail route here — but unlike the
 * contract and outlet ones this **does** need `<Suspense>`, because the workspace reads
 * `?view=` through `useSearchParams` and the build fails without a boundary above it.
 */
export default async function SpaceDetailPage({ params }: PageProps<"/spaces/[id]">) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <SchemeWorkspace schemeId={id} />
    </Suspense>
  );
}
