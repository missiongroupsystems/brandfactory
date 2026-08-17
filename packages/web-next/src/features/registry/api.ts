import { apiFetch, query } from "@/lib/api/client";
import type {
  Contract,
  ContractSensitive,
  Entity,
  EntityCloseBody,
  EntityCreate,
  EntityStatus,
  EntityUpdate,
  Outlet,
  OutletCloseBody,
  OutletCreate,
  OutletStatus,
  OutletType,
  OutletUpdate,
  Page,
} from "@/lib/api/types";

/** Entities and outlets — the registry spine everything else hangs off (spec §4.1). */

export type OutletFilters = {
  status?: OutletStatus;
  outlet_type?: OutletType;
  entity_id?: string;
  // The id, not the name. `GET /outlets` still accepts `?brand=<name>` so that a link written
  // before brands became a table keeps narrowing the table, but it is deprecated on the API and
  // removed in 0.16.0 — nothing here should write it.
  brand_id?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

export type EntityFilters = {
  status?: EntityStatus;
  // `GET /entities` has taken this since 0.15.0. The *screens* that expose it — the entity form's
  // field, the Brand column and its filter — are Stage 4; the brand detail page needs the query
  // before then to list the companies carrying a brand.
  brand_id?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

export const entityService = {
  list: (params: EntityFilters = {}) => apiFetch<Page<Entity>>(`/entities${query(params)}`),

  get: (id: string) => apiFetch<Entity>(`/entities/${id}`),

  create: (data: EntityCreate) =>
    apiFetch<Entity>("/entities", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: EntityUpdate) =>
    apiFetch<Entity>(`/entities/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  /**
   * Close the entity, resolving each still-open outlet under it — transfer to another entity
   * or close (which disposes that outlet's contracts). The two-level retire flow (Cluster D),
   * applied atomically server-side; not a status PATCH.
   */
  close: (id: string, data: EntityCloseBody) =>
    apiFetch<Entity>(`/entities/${id}/close`, { method: "POST", body: JSON.stringify(data) }),

  remove: (id: string) => apiFetch<void>(`/entities/${id}`, { method: "DELETE" }),
};

export const outletService = {
  list: (params: OutletFilters = {}) => apiFetch<Page<Outlet>>(`/outlets${query(params)}`),

  get: (id: string) => apiFetch<Outlet>(`/outlets/${id}`),

  create: (data: OutletCreate) =>
    apiFetch<Outlet>("/outlets", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: OutletUpdate) =>
    apiFetch<Outlet>(`/outlets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  /**
   * The open contracts a close of this outlet would have to dispose of — title, vendor and
   * full coverage per contract, so the dialog can warn when one still covers other live
   * outlets. `ContractRead | ContractSensitive` (the value-gate split); a member never sees a
   * value here.
   */
  relatedContracts: (id: string) =>
    apiFetch<(Contract | ContractSensitive)[]>(`/outlets/${id}/related-contracts`),

  /**
   * Close the outlet, disposing every still-open contract that covers it (cease / reassign /
   * orphan). Applied atomically with the status flip server-side; the frontend uses this in
   * place of a status→closed PATCH whenever the outlet has related open contracts.
   */
  close: (id: string, data: OutletCloseBody) =>
    apiFetch<Outlet>(`/outlets/${id}/close`, { method: "POST", body: JSON.stringify(data) }),

  /**
   * PUT, and the payload is the complete set — not a delta.
   *
   * These attributes drive license requirement suggestions, so "exactly what the user
   * ticked" matters more than sending a minimal diff.
   */
  replaceAttributes: (id: string, attributes: string[]) =>
    apiFetch<Outlet>(`/outlets/${id}/attributes`, {
      method: "PUT",
      body: JSON.stringify({ attributes }),
    }),

  remove: (id: string) => apiFetch<void>(`/outlets/${id}`, { method: "DELETE" }),
};
