import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows, PageState } from "@/components/layout/query-states";
import { EntitiesBrowser } from "@/features/registry/components/entities-browser";

/** Server shell, interactive half under `<Suspense>` — see the outlets page on why. */
export default function EntitiesPage() {
  return (
    <>
      <PageHeader
        title="Entities"
        description="Legal operating companies. Licences are held by an entity rather than by a building, so an outlet can move between our own companies without the premises changing and the licences follow the entity."
      />
      <Suspense fallback={<PageState><LoadingRows rows={4} /></PageState>}>
        <EntitiesBrowser />
      </Suspense>
    </>
  );
}
