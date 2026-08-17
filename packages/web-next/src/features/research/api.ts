import type { InferResponseType } from "hono/client";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * Brand research — the one thing in this product that spends vendor money, about $0.40 and
 * three to fifteen minutes a run.
 *
 * Only the **start** lives here, and only because the create form is one of research's two
 * entry points (the other is the brand hub's rail, which this shell does not have yet). The
 * lifecycle — polling, the report, the drafts — is `packages/web`'s and stays there until this
 * app has a brand hub to render it on.
 */
export type ResearchJobSummary = InferResponseType<(typeof bf.brands)[":id"]["research"]["$post"]>;

export const researchService = {
  /**
   * Start a run. The server takes no body: everything the run needs is already on the brand,
   * which is why the same call serves both entry points.
   */
  start: async (brandId: string): Promise<ResearchJobSummary> =>
    callJson<ResearchJobSummary>(await bf.brands[":id"].research.$post({ param: { id: brandId } })),
};
