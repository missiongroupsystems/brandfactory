"use client";

import type { SocialPost } from "@brandfactory/shared";
import * as React from "react";
import useSWR from "swr";

import { SCOPES } from "@/lib/api/cache";

import { socialPostService } from "./api";

/**
 * A brand's social posts, newest scheduled first, with the unscheduled tray last.
 *
 * **`scheduledAt: null` is a real state, not missing data** — it is the idea tray the planner
 * writes into, and those posts sort after the scheduled ones rather than before.
 */
export function useSocialPosts(brandId: string | undefined) {
  const { data, error, isLoading } = useSWR<SocialPost[]>(
    brandId ? [SCOPES.bfSocialPosts, brandId] : null,
    () => socialPostService.list(brandId!),
    { revalidateOnFocus: false },
  );

  const posts = React.useMemo(() => {
    return [...(data ?? [])].sort((a, b) => {
      // Unscheduled last. Two nulls tie and fall through to the id, so two reads
      // of one brand order identically.
      if (a.scheduledAt === null && b.scheduledAt !== null) return 1;
      if (a.scheduledAt !== null && b.scheduledAt === null) return -1;
      if (a.scheduledAt && b.scheduledAt && a.scheduledAt !== b.scheduledAt) {
        return a.scheduledAt < b.scheduledAt ? 1 : -1;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }, [data]);

  return { posts, isLoading, error };
}
