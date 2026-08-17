"use client";

import * as React from "react";
import useSWR from "swr";

import { attachmentService } from "@/features/contracts/api";
import { useAttachmentMutations } from "@/features/contracts/hooks";
import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type { Expense, ExpenseCreate } from "@/lib/api/types";

import {
  expenseService,
  type ExpenseFilters,
  type SpendSummaryParams,
} from "./api";

export type { ExpenseFilters, SpendSummaryParams };

export function useExpensePages(filters: ExpenseFilters = {}) {
  return useCursorPages<Expense>(SCOPES.expenses, filters, (cursor) =>
    expenseService.list({ ...filters, cursor }),
  );
}

/** A single-page list, for the outlet detail card — an outlet has a handful of repairs and
 * `limit: 200` fetches them all without a "load more". */
export function useExpenses(filters: ExpenseFilters = {}) {
  return useSWR([SCOPES.expenses, "flat", filters], () =>
    expenseService.list({ ...filters, limit: 200 }),
  );
}

/** The monthly rollup. A **null key** when the window is incomplete, because an SWR array key is
 * truthy however empty its contents and a summary with no `from`/`to` is a 422 on every render. */
export function useExpenseSummary(params: SpendSummaryParams | null) {
  return useSWR(params ? [SCOPES.expenseSummary, params] : null, () =>
    expenseService.summary(params!),
  );
}

/**
 * Record one repair, and — if a photo was taken — file it as the invoice/receipt, in one call.
 *
 * The document is a **second** request: the expense row is written first, then the existing
 * two-step presign uploads the bytes against it as a `receipt`. If the upload fails the row still
 * stands (a repair with no document yet is a real, allowed state).
 *
 * **A repair is money, so a retry must never write a second row.** The created expense is held in
 * a ref, so if the upload throws and the person submits again, only the *upload* is retried — not
 * a fresh `create` that would double-count the month. `reset()` (called when the sheet reopens)
 * clears it, so the next repair starts a new row. The summary is invalidated alongside the list —
 * a new repair changes a month's total, and a stale rollup beside a fresh list is the
 * "denominator smaller than its table" bug this repo has hit before.
 */
export function useRecordRepair() {
  const invalidate = useInvalidate();
  const { upload } = useAttachmentMutations();
  const createdRef = React.useRef<Expense | null>(null);

  const recordRepair = React.useCallback(
    async (data: ExpenseCreate, file: File | null) => {
      // Reuse the row a prior attempt already wrote (its upload failed) rather than creating a
      // second one — the double-counted-spend bug.
      const expense = createdRef.current ?? (await expenseService.create(data));
      createdRef.current = expense;
      if (file) {
        await upload(file, "expense", expense.id, "receipt");
      }
      await invalidate(SCOPES.expenses, SCOPES.expenseSummary);
      createdRef.current = null; // full success — the next submit is a new repair
      return expense;
    },
    [invalidate, upload],
  );

  // Cleared when the sheet (re)opens, so a fresh repair never inherits a prior row's id.
  const reset = React.useCallback(() => {
    createdRef.current = null;
  }, []);

  return { recordRepair, reset };
}

/**
 * Click a repair's invoice photo and get the file, in the one request it costs.
 *
 * The row carries `attachment_count`, not the id — so the ids are fetched here and the only one
 * handed straight to `download`, which mints its own short-lived signed URL. Mirrors
 * `useOpenReportDocument`. `pendingId` is the expense being fetched, so only the clicked row shows
 * it is working.
 */
export function useOpenExpenseDocument() {
  const { download } = useAttachmentMutations();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const open = React.useCallback(
    async (expenseId: string) => {
      setPendingId(expenseId);
      try {
        const page = await attachmentService.list("expense", expenseId);
        const first = page.items[0];
        if (!first) throw new Error("This repair has no document filed against it.");
        await download(first.id);
      } finally {
        setPendingId(null);
      }
    },
    [download],
  );

  return { open, pendingId };
}
