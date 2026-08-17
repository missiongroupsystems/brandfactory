import { apiFetch, query } from "@/lib/api/client";
import type { DashboardSummary, GenerationReport, Obligation } from "@/lib/api/types";

/** The attention surface, and the two obligation actions it needs. */

export const dashboardService = {
  get: (params: { outlet_id?: string; entity_id?: string } = {}) =>
    apiFetch<DashboardSummary>(`/dashboard${query(params)}`),
};

export const obligationService = {
  complete: (id: string) =>
    apiFetch<Obligation>(`/obligations/${id}/complete`, { method: "POST" }),

  /** Refresh licence statuses and re-run every generator, on demand. Idempotent. */
  generate: () =>
    apiFetch<GenerationReport>("/obligations/generate", { method: "POST" }),
};
