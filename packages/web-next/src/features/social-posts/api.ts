import type { SocialPost } from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * A brand's planned social posts, **read here and written from the calendar.**
 *
 * The planner that writes these (the month grid, the drag-to-schedule, the AI brainstorm) is
 * 11,814 lines in `packages/web` and is a separate migration. What this service exists for is
 * narrower and specific: the marketing funnel lets an activity point at a social push, and a link
 * needs somewhere in *this* app to land. Without it the only honest options were plain text or a
 * link that ejects the reader to a different app on a different port.
 *
 * So: list and read, no writes, in this folder. The writes arrived with the content calendar and
 * live in `features/calendar/api.ts`, beside the screen that makes them; both revalidate this
 * folder's scope, so the funnel's picker sees a new post without a reload.
 */
export const socialPostService = {
  list: async (brandId: string): Promise<SocialPost[]> =>
    callJson<SocialPost[]>(await bf.brands[":id"]["social-posts"].$get({ param: { id: brandId } })),
};
