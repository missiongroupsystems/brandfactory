"use client";

import * as React from "react";
import useSWR from "swr";

import { attachmentService } from "@/features/contracts/api";
import { useAttachmentMutations } from "@/features/contracts/hooks";
import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type { ServiceReportFiling, ServiceReportListItem } from "@/lib/api/types";

import { serviceReportService, type ServiceReportFilters } from "./api";

/**
 * The Filed log, paginated.
 *
 * On `SCOPES.reports`, the scope `useServiceMutations` already invalidates after a visit or a
 * report write — so a filing made anywhere in the product refreshes this list without either
 * side knowing about the other. That matters more here than usual: `useSWRInfinite` stores its
 * pages under an aggregate `$inf$` key that `mutate(matcherFn)` cannot reach, and `useInvalidate`
 * is the one place that handles both halves.
 */
export function useServiceReportPages(filters: ServiceReportFilters = {}) {
  return useCursorPages<ServiceReportListItem>(SCOPES.reports, filters, (cursor) =>
    serviceReportService.list({ ...filters, cursor }),
  );
}

/**
 * Filing, and the document that goes with it.
 *
 * **Two calls, in this order, and the second is not optional to the user's mind.** The API writes
 * the visit and the report in one transaction; the bytes go to object storage through the presign
 * flow, which is a separate round trip against the report that has just come back. The caller
 * keeps its sheet open until both have finished — a toast saying "Filed" over a document that
 * never arrived is the failure this whole page exists to prevent.
 *
 * The scopes are the same five `useServiceMutations` invalidates, because a filing moves exactly
 * what a visit and a report move: the health verdicts, the visit and report lists, the schedules
 * panel, and (once the generator runs) the dashboard. `useAttachmentMutations().upload` invalidates
 * the attachments scope itself, which is what makes Filed's `attachment_count` correct on return.
 */
export function useFileReport() {
  const invalidate = useInvalidate();
  const { upload } = useAttachmentMutations();

  return React.useCallback(
    async (payload: ServiceReportFiling, file?: File | null) => {
      const filed = await serviceReportService.file(payload);
      if (file) {
        await upload(file, "service_report", filed.report.id, "service_report");
      }
      await invalidate(
        SCOPES.schedules,
        SCOPES.visits,
        SCOPES.reports,
        SCOPES.serviceHealth,
        SCOPES.dashboard,
      );
      return filed;
    },
    [invalidate, upload],
  );
}

/**
 * How many filings are still waiting for their paper — Expected's second honesty clause.
 *
 * **A query of its own, not a count of what Expected is holding.** Expected's rows are
 * (contract, outlet) pairs on a cadence; a report awaiting its document may belong to an ad-hoc
 * contract with no pair at all, so counting from the loaded page would print a number that is
 * true of a different set. It is not read off the review queue either: `/review/summary` counts
 * *items*, which only exist after somebody has run the sweep, so a real gap would read `0` until
 * the day the detector last ran. This asks the reports themselves.
 *
 * **Capped, and it says so when it caps.** The API returns `next_cursor` and no total, by design
 * — so past the limit the honest answer is `100+` rather than a number the endpoint never gave.
 * At ~20 filings a month the cap is years away; it exists so the line cannot ever quietly claim
 * a total it does not have.
 */
const AWAITING_LIMIT = 100;

export function useAwaitingDocument(): { count: number | undefined; capped: boolean } {
  const { data } = useSWR([SCOPES.reports, "awaiting-document"], () =>
    serviceReportService.list({ has_document: false, limit: AWAITING_LIMIT }),
  );
  if (!data) return { count: undefined, capped: false };
  return { count: data.items.length, capped: Boolean(data.next_cursor) };
}

/**
 * One report's documents, fetched **only while its popover is open**.
 *
 * `undefined` means do not ask, and it has to be a `null` key rather than an array holding an
 * empty id: an SWR array key is truthy however empty its contents, so `[scope, ""]` would fetch
 * `/attachments?subject_type=service_report` with no `subject_id` and take a 422 on every render.
 *
 * The row already knows *how many* documents there are — `attachment_count`, which is on the list
 * shape precisely so a page of fifty reports is not fifty requests. This is the second half of
 * that trade: the ids cost a request, and it is paid once, by the row that was clicked.
 */
export function useReportDocuments(reportId: string | undefined) {
  return useSWR(reportId ? [SCOPES.attachments, "service_report", reportId] : null, () =>
    attachmentService.list("service_report", reportId!),
  );
}

/**
 * Click a report's single document and get the file — the "one click to its PDF" the plan asks
 * for, in the one request it costs.
 *
 * Two steps that the reader should not have to take separately: the row carries a count and not
 * an id, so the ids are fetched here and the only one is handed straight to `download`, which
 * mints its own short-lived signed URL. `pendingId` is the report being fetched, so the row that
 * was clicked can show it is working without a spinner appearing on all fifty.
 */
export function useOpenReportDocument() {
  const { download } = useAttachmentMutations();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const open = React.useCallback(
    async (reportId: string) => {
      setPendingId(reportId);
      try {
        const page = await attachmentService.list("service_report", reportId);
        const first = page.items[0];
        if (!first) throw new Error("This report has no document filed against it.");
        await download(first.id);
      } finally {
        setPendingId(null);
      }
    },
    [download],
  );

  return { open, pendingId };
}
