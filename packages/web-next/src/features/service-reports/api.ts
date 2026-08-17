import { apiFetch, query } from "@/lib/api/client";
import type {
  Page,
  ServiceCategory,
  ServiceReportFiled,
  ServiceReportFiling,
  ServiceReportListItem,
} from "@/lib/api/types";

/**
 * The Filed log — `GET /service-reports`, grown in Stage 4 from a `?visit_id=` lookup into a
 * list a table can render.
 *
 * A feature of its own rather than another function in `features/contracts/api.ts`, because a
 * filed report is a different noun from an agreement: it is the paper a vendor left behind.
 * `serviceService` over there still owns schedules, visits and the two-step attach — those are
 * read from the *contract's* page and belong to it.
 */

export type ServiceReportFilters = {
  outlet_id?: string;
  contract_id?: string;
  vendor_id?: string;
  category?: ServiceCategory;
  /** `report_date >= `, inclusive. `from` on the wire because that is the API's name for it. */
  from?: string;
  /** `report_date <= `, inclusive. */
  to?: string;
  /**
   * Tri-state, and `false` is the one with a job: the reports filed with no document yet.
   * Absent does not narrow. `query()` sends `false` (it drops only `undefined`, `null` and
   * `""`), which is what makes the missing-document worklist reachable at all.
   */
  has_document?: boolean;
};

export const serviceReportService = {
  /**
   * `cursor` is an **opaque string**, not a UUID — this list is ordered by the date the service
   * happened rather than by insertion, so the cursor carries both halves of that key. Pass back
   * `next_cursor` unchanged; anything else is a 422.
   */
  list: (params: ServiceReportFilters & { cursor?: string; limit?: number } = {}) =>
    apiFetch<Page<ServiceReportListItem>>(`/service-reports${query(params)}`),

  /**
   * One call, two rows, one act. The document is a **second** call — the existing presign
   * upload against the returned report — because bytes never go through this API.
   *
   * `recorded_by` is not on the payload and cannot be: who filed a report is a fact about the
   * request, not a claim the request gets to make.
   */
  file: (data: ServiceReportFiling) =>
    apiFetch<ServiceReportFiled>("/service-reports", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
