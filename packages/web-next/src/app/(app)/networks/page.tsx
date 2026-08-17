import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { NetworksBrowser } from "@/features/networks/components/networks-browser";

/** Server shell, interactive half under `<Suspense>` — see the outlets page on why. */
export default function NetworksPage() {
  return (
    <>
      <PageHeader
        title="Networks"
        description="Wifi, providers and hardware per outlet. This is the area that exercises sensitive-field gating: the ops team receives passwords, everyone else receives a response shape on which those fields do not exist at all."
      />
      <Suspense fallback={<LoadingRows rows={4} />}>
        <NetworksBrowser />
      </Suspense>
    </>
  );
}
