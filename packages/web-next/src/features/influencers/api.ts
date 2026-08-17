import { apiFetch, query } from "@/lib/api/client";
import type {
  Influencer,
  InfluencerPlatform,
  InfluencerStatus,
  InfluencerVertical,
  Page,
} from "@/lib/api/types";

/**
 * The creators the brands partner with.
 *
 * **The route is `/influencers`, and it is this app's own.** Every other path this service layer
 * family calls is the Operations Hub's, frozen in `schema.d.ts` — which is why `/brands` on the
 * wire stays `/brands` even though the folder and the route say `registry-brands`. There is no
 * Ops endpoint behind this one: the screen used to call `/contacts`, the address book, and that
 * path still exists and still means what it always did. So the rule that keeps a backend's path
 * out of a rename does not apply here, and folder, route, cache scope and wire path all say
 * `influencers`.
 *
 * Answered by `lib/api/mock.ts` from `fixtures/influencers.ts`. Nothing is stored, and a
 * mutation refuses with a 503 — see that file's rule 3.
 */

export type InfluencerFilters = {
  /** Name or handle. Both are the row's own fields, so this joins to nothing — see
   *  {@link InfluencerFilters} usage in `influencers-browser.tsx` for why the search box says
   *  so. */
  q?: string;
  platform?: InfluencerPlatform;
  vertical?: InfluencerVertical;
  status?: InfluencerStatus;
  /** One brand the creator is engaged for. The row holds an array, so this is a `contains`
   *  test rather than an equality one — the same shape `/contracts` filters `brand_ids` with. */
  brand_id?: string;
  cursor?: string;
  limit?: number;
};

/**
 * `list` and nothing else.
 *
 * No `get`, because there is no `/influencers/[id]` page to call it — a creator's row carries
 * everything the screen knows about them, so a detail page would be the same seven fields with
 * more whitespace. No `create`, `update` or `remove`, because there is no route to accept them;
 * see `hooks.ts` on why there is no mutations hook either.
 *
 * Written this narrow on purpose. An unused service method is the same hazard as an unused cache
 * scope — something nothing exercises and everything can call by mistake.
 */
export const influencerService = {
  list: (params: InfluencerFilters = {}) =>
    apiFetch<Page<Influencer>>(`/influencers${query(params)}`),
};
