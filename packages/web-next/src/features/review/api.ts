import { apiFetch, query } from "@/lib/api/client";
import type {
  Page,
  ReviewItem,
  ReviewKind,
  ReviewSummary,
  ReviewSweepReport,
  ReviewView,
  SubjectType,
} from "@/lib/api/types";

/**
 * The data-quality queue (`docs/executing/document-review.md`).
 *
 * **Ops and admins only, reads included** — the API refuses a `member` on every route
 * here, so a 403 surfaces as `QueryError`'s "Not permitted" rather than an empty table.
 *
 * There is no update service on this file, and that is the design: re-typing a document
 * is `PATCH /attachments/{id}`, deleting one is `DELETE /attachments/{id}`, filling a
 * contract's gap is `PATCH /contracts/{id}`. Those live in the contracts feature and the
 * queue calls them, rather than growing a second path to the same writes.
 */

export type ReviewFilters = {
  kind?: ReviewKind;
  subject_type?: SubjectType;
  outlet_id?: string;
  view?: ReviewView;
  cursor?: string;
  limit?: number;
};

/** The summary takes the list's filters minus `kind` (it groups by it) and `view` (it
 * counts open work only). They must match or the group headers count a different set
 * from the rows underneath them. */
export type ReviewSummaryFilters = Pick<ReviewFilters, "subject_type" | "outlet_id">;

export const reviewService = {
  list: (params: ReviewFilters = {}) => apiFetch<Page<ReviewItem>>(`/review${query(params)}`),

  summary: (params: ReviewSummaryFilters = {}) =>
    apiFetch<ReviewSummary>(`/review/summary${query(params)}`),

  /** "The record was changed." Does *not* suppress: if the next sweep still finds the
   * problem, a fresh item appears beside this one. */
  resolve: (id: string, note?: string) =>
    apiFetch<ReviewItem>(`/review/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ note: note ?? null }),
    }),

  /** "The record is right as it stands." Suppresses the item permanently — the record
   * still matches the detector and always will. */
  dismiss: (id: string, note?: string) =>
    apiFetch<ReviewItem>(`/review/${id}/dismiss`, {
      method: "POST",
      body: JSON.stringify({ note: note ?? null }),
    }),

  /** Re-run the detectors. Idempotent; the second run reports nothing changed. */
  generate: () => apiFetch<ReviewSweepReport>("/review/generate", { method: "POST" }),
};
