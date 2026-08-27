"use client";

import type {
  CreateFunnelActivityInput,
  CreateFunnelStageInput,
  CreatePlatformInput,
  FunnelStageWithDetail,
  Platform,
  SocialPostId,
  UpdateFunnelActivityInput,
} from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { SCOPES, useRevalidate } from "@/lib/api/cache";

import { funnelService } from "./api";

export function useFunnel(brandId: string | undefined) {
  const stages = useSWR<FunnelStageWithDetail[]>(
    brandId ? [SCOPES.bfFunnel, brandId] : null,
    () => funnelService.list(brandId!),
    { revalidateOnFocus: false },
  );
  const platforms = useSWR<Platform[]>(
    brandId ? [SCOPES.bfFunnel, "platforms", brandId] : null,
    () => funnelService.listPlatforms(brandId!),
    { revalidateOnFocus: false },
  );

  return {
    stages: stages.data ?? [],
    platforms: platforms.data ?? [],
    isLoading: stages.isLoading || platforms.isLoading,
    error: stages.error ?? platforms.error,
  };
}

export function useFunnelMutations(brandId: string | undefined) {
  // `useRevalidate`, not `useInvalidate`: the latter empties the cache entry, so the
  // grid behind a sheet throws itself away and rebuilds on every write.
  const revalidate = useRevalidate();
  const sweep = React.useCallback(async () => {
    await revalidate(SCOPES.bfFunnel);
  }, [revalidate]);

  return React.useMemo(
    () => ({
      createStage: async (input: CreateFunnelStageInput) => {
        const row = await funnelService.createStage(brandId!, input);
        await sweep();
        return row;
      },
      renameStage: async (stageId: string, name: string) => {
        const row = await funnelService.updateStage(brandId!, stageId, { name });
        await sweep();
        return row;
      },
      deleteStage: async (stageId: string) => {
        const row = await funnelService.deleteStage(brandId!, stageId);
        await sweep();
        return row;
      },
      createPlatform: async (input: CreatePlatformInput) => {
        const row = await funnelService.createPlatform(brandId!, input);
        await sweep();
        return row;
      },
      attachPlatform: async (stageId: string, platformId: string) => {
        const row = await funnelService.attachPlatform(brandId!, stageId, platformId);
        await sweep();
        return row;
      },
      detachPlatform: async (stageId: string, platformId: string) => {
        const row = await funnelService.detachPlatform(brandId!, stageId, platformId);
        await sweep();
        return row;
      },
      createActivity: async (stageId: string, input: CreateFunnelActivityInput) => {
        const row = await funnelService.createActivity(brandId!, stageId, input);
        await sweep();
        return row;
      },
      updateActivity: async (
        stageId: string,
        activityId: string,
        input: UpdateFunnelActivityInput,
      ) => {
        const row = await funnelService.updateActivity(brandId!, stageId, activityId, input);
        await sweep();
        return row;
      },
      /**
       * Link an activity to a social post, or clear the link.
       *
       * **Its own function so the branded-id cast lives in one place.** `socialPostId`
       * is `SocialPostId` on the wire and a `<select>` hands back a plain string; casting
       * at each call site is how one of them ends up casting the wrong thing. The empty
       * string is the "No linked post" option and becomes `null`, which is a choice
       * rather than a blank — the same distinction the patch schema draws between absent
       * and null.
       */
      setLinkedPost: async (stageId: string, activityId: string, postId: string | null) => {
        const row = await funnelService.updateActivity(brandId!, stageId, activityId, {
          socialPostId: (postId || null) as SocialPostId | null,
        });
        await sweep();
        return row;
      },
      deleteActivity: async (stageId: string, activityId: string) => {
        const row = await funnelService.deleteActivity(brandId!, stageId, activityId);
        await sweep();
        return row;
      },
    }),
    [brandId, sweep],
  );
}
