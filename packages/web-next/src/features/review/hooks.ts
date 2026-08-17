"use client";

import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type { ReviewItem } from "@/lib/api/types";

import { reviewService, type ReviewFilters, type ReviewSummaryFilters } from "./api";

/**
 * Same shape as every other area: `use*` subscribes, `use*Mutations` writes and
 * invalidates by scope.
 *
 * The invalidation here is wider than it looks, and deliberately so: closing an item or
 * re-running the sweep changes the **counts** as well as the rows, and the counts render
 * as the group headers above those rows. Refreshing one without the other leaves a header
 * reading 171 above a group that just lost a member — the sort of small lie this product
 * exists to stop.
 */

export function useReviewPages(filters: ReviewFilters = {}) {
  return useCursorPages<ReviewItem>(SCOPES.review, filters, (cursor) =>
    reviewService.list({ ...filters, cursor }),
  );
}

export function useReviewSummary(filters: ReviewSummaryFilters = {}) {
  return useSWR([SCOPES.reviewSummary, filters], () => reviewService.summary(filters));
}

export function useReviewMutations() {
  const invalidate = useInvalidate();

  const refreshQueue = React.useCallback(
    () => invalidate(SCOPES.review, SCOPES.reviewSummary),
    [invalidate],
  );

  const resolve = React.useCallback(
    async (id: string, note?: string) => {
      const item = await reviewService.resolve(id, note);
      await refreshQueue();
      return item;
    },
    [refreshQueue],
  );

  const dismiss = React.useCallback(
    async (id: string, note?: string) => {
      const item = await reviewService.dismiss(id, note);
      await refreshQueue();
      return item;
    },
    [refreshQueue],
  );

  const generate = React.useCallback(async () => {
    const report = await reviewService.generate();
    await refreshQueue();
    return report;
  }, [refreshQueue]);

  /**
   * The queue *and* the record it points at, after a write that went through another
   * feature's endpoint. Both halves are needed: the row and the group count live in the
   * review scopes, and the contract or document the row names lives in its own.
   */
  const refreshAfterFix = React.useCallback(
    () =>
      invalidate(
        SCOPES.review,
        SCOPES.reviewSummary,
        SCOPES.contracts,
        SCOPES.contract,
        SCOPES.attachments,
      ),
    [invalidate],
  );

  /**
   * After a write that went through *another* feature's endpoint — a contract PATCH or a
   * document re-type.
   *
   * The item does not disappear on its own: the sweep is what removes an item whose
   * record no longer matches, and it runs when somebody asks it to. So the honest thing
   * after fixing the underlying fact is to mark the item resolved *and* invalidate the
   * record's own scope, which is what this does — the row leaves the open queue
   * immediately and the next sweep agrees with the screen rather than re-raising it.
   *
   * **Not for a delete.** Deleting the record takes its review items with it (the
   * backend's `subjects.discard_derived`), so there is no item left to resolve and asking
   * for one is a 404. Use `refreshAfterFix` alone there.
   */
  const resolveAfterFix = React.useCallback(
    async (id: string, note?: string) => {
      const item = await reviewService.resolve(id, note);
      await refreshAfterFix();
      return item;
    },
    [refreshAfterFix],
  );

  return { resolve, dismiss, generate, resolveAfterFix, refreshAfterFix };
}
