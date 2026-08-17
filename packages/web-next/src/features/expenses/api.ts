import { apiFetch, query } from "@/lib/api/client";
import type {
  Expense,
  ExpenseCreate,
  ExpenseUpdate,
  Page,
  RepairCategory,
  SpendGranularity,
  SpendGroupBy,
  SpendSummary,
} from "@/lib/api/types";

/**
 * Spend records — repair-first (spec §4.8, `docs/plans/servicing-and-repairs.md`).
 *
 * A feature of its own rather than another function in `features/service-reports/api.ts`,
 * because a repair is a different noun from the paper a vendor left after a *scheduled* visit:
 * it hangs off the outlet directly, carries an amount, and never touches a schedule or cadence.
 * The Servicing & Repairs area shell (`service-reports-browser`) switches between the two.
 *
 * Amounts are not sensitive — one read shape, no narrowed sibling. The invoice/receipt photo is a
 * **second** call (the existing two-step presign against the returned expense), because bytes
 * never go through this API.
 */

export type ExpenseFilters = {
  outlet_id?: string;
  vendor_id?: string;
  contract_id?: string;
  category?: RepairCategory;
  /** `incurred_on >= `, inclusive. */
  date_from?: string;
  /** `incurred_on <= `, inclusive. */
  date_to?: string;
};

export type SpendSummaryParams = {
  group_by: SpendGroupBy;
  granularity: SpendGranularity;
  /** Both required — an unbounded aggregate over a growing table is a slow query nobody asked
   * for, and "end of each month" always has a window. `from`/`to` are the API's names. */
  from: string;
  to: string;
  outlet_id?: string;
  vendor_id?: string;
  contract_id?: string;
  category?: RepairCategory;
};

export const expenseService = {
  list: (params: ExpenseFilters & { cursor?: string; limit?: number } = {}) =>
    apiFetch<Page<Expense>>(`/expenses${query(params)}`),

  get: (id: string) => apiFetch<Expense>(`/expenses/${id}`),

  create: (data: ExpenseCreate) =>
    apiFetch<Expense>("/expenses", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: ExpenseUpdate) =>
    apiFetch<Expense>(`/expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  remove: (id: string) => apiFetch<void>(`/expenses/${id}`, { method: "DELETE" }),

  /** The monthly rollup — an aggregate resource, not a total on the list, because the list pages
   * on a cursor. Takes the list's filters (except the one it groups by) and the caller's scope. */
  summary: (params: SpendSummaryParams) =>
    apiFetch<SpendSummary>(`/expenses/summary${query(params)}`),
};
