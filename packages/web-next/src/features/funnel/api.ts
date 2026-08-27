import type {
  CreateFunnelActivityInput,
  CreateFunnelStageInput,
  CreatePlatformInput,
  FunnelActivity,
  FunnelStage,
  FunnelStageWithDetail,
  Platform,
  UpdateFunnelActivityInput,
  UpdateFunnelStageInput,
} from "@brandfactory/shared";

import { bf, callJson } from "@/lib/api/bf-client";

/**
 * A brand's marketing funnel — the one view of what it runs and where in the journey.
 *
 * **Exhaustive, no cursor.** Six stages and a handful of activities each. The screen shows all of
 * it, which is the request's own framing: *one view*, for planning and alignment.
 */
export const funnelService = {
  list: async (brandId: string): Promise<FunnelStageWithDetail[]> =>
    callJson<FunnelStageWithDetail[]>(await bf.brands[":id"].funnel.$get({ param: { id: brandId } })),

  listPlatforms: async (brandId: string): Promise<Platform[]> =>
    callJson<Platform[]>(
      await bf.brands[":id"].funnel.platforms.$get({ param: { id: brandId } }),
    ),

  createStage: async (brandId: string, input: CreateFunnelStageInput): Promise<FunnelStage> =>
    callJson<FunnelStage>(
      await bf.brands[":id"].funnel.stages.$post({ param: { id: brandId }, json: input }),
    ),

  updateStage: async (
    brandId: string,
    stageId: string,
    input: UpdateFunnelStageInput,
  ): Promise<FunnelStage> =>
    callJson<FunnelStage>(
      await bf.brands[":id"].funnel.stages[":stageId"].$patch({
        param: { id: brandId, stageId },
        json: input,
      }),
    ),

  deleteStage: async (brandId: string, stageId: string): Promise<FunnelStage> =>
    callJson<FunnelStage>(
      await bf.brands[":id"].funnel.stages[":stageId"].$delete({ param: { id: brandId, stageId } }),
    ),

  createPlatform: async (brandId: string, input: CreatePlatformInput): Promise<Platform> =>
    callJson<Platform>(
      await bf.brands[":id"].funnel.platforms.$post({ param: { id: brandId }, json: input }),
    ),

  attachPlatform: async (
    brandId: string,
    stageId: string,
    platformId: string,
  ): Promise<FunnelStageWithDetail> =>
    callJson<FunnelStageWithDetail>(
      await bf.brands[":id"].funnel.stages[":stageId"].platforms[":platformId"].$post({
        param: { id: brandId, stageId, platformId },
      }),
    ),

  detachPlatform: async (
    brandId: string,
    stageId: string,
    platformId: string,
  ): Promise<FunnelStageWithDetail> =>
    callJson<FunnelStageWithDetail>(
      await bf.brands[":id"].funnel.stages[":stageId"].platforms[":platformId"].$delete({
        param: { id: brandId, stageId, platformId },
      }),
    ),

  createActivity: async (
    brandId: string,
    stageId: string,
    input: CreateFunnelActivityInput,
  ): Promise<FunnelActivity> =>
    callJson<FunnelActivity>(
      await bf.brands[":id"].funnel.stages[":stageId"].activities.$post({
        param: { id: brandId, stageId },
        json: input,
      }),
    ),

  updateActivity: async (
    brandId: string,
    stageId: string,
    activityId: string,
    input: UpdateFunnelActivityInput,
  ): Promise<FunnelActivity> =>
    callJson<FunnelActivity>(
      await bf.brands[":id"].funnel.stages[":stageId"].activities[":activityId"].$patch({
        param: { id: brandId, stageId, activityId },
        json: input,
      }),
    ),

  deleteActivity: async (
    brandId: string,
    stageId: string,
    activityId: string,
  ): Promise<FunnelActivity> =>
    callJson<FunnelActivity>(
      await bf.brands[":id"].funnel.stages[":stageId"].activities[":activityId"].$delete({
        param: { id: brandId, stageId, activityId },
      }),
    ),
};
