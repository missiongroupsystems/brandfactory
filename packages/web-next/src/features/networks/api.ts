import { apiFetch, query } from "@/lib/api/client";
import type {
  DeviceType,
  NetworkDevice,
  NetworkDeviceCreate,
  NetworkDeviceUpdate,
  OutletNetwork,
  OutletNetworkCreate,
  OutletNetworkSensitive,
  OutletNetworkUpdate,
  Page,
} from "@/lib/api/types";

/**
 * Outlet wifi and hardware — spec §4.4.
 *
 * The read type is a union because the API returns a different *shape* depending on the
 * caller's role: the ops team gets passwords, everyone else gets a schema on which those
 * fields do not exist. Use `hasSensitiveFields()` to narrow rather than testing for null —
 * a null password means "none recorded", not "not allowed to see it".
 */

export type NetworkRead = OutletNetwork | OutletNetworkSensitive;

export const networkService = {
  list: (params: { outlet_id?: string; cursor?: string; limit?: number } = {}) =>
    apiFetch<Page<NetworkRead>>(`/outlet-networks${query(params)}`),

  get: (id: string) => apiFetch<NetworkRead>(`/outlet-networks/${id}`),

  /** The lookup the ops team actually performs: "what is the wifi at X". */
  forOutlet: (outletId: string) => apiFetch<NetworkRead>(`/outlets/${outletId}/network`),

  create: (data: OutletNetworkCreate) =>
    apiFetch<NetworkRead>("/outlet-networks", { method: "POST", body: JSON.stringify(data) }),

  /** Sending a password field without the ops role is a 403, not a silent no-op. */
  update: (id: string, data: OutletNetworkUpdate) =>
    apiFetch<NetworkRead>(`/outlet-networks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) => apiFetch<void>(`/outlet-networks/${id}`, { method: "DELETE" }),
};

export const deviceService = {
  list: (
    params: { outlet_id?: string; device_type?: DeviceType; cursor?: string; limit?: number } = {},
  ) => apiFetch<Page<NetworkDevice>>(`/network-devices${query(params)}`),

  get: (id: string) => apiFetch<NetworkDevice>(`/network-devices/${id}`),

  create: (data: NetworkDeviceCreate) =>
    apiFetch<NetworkDevice>("/network-devices", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: NetworkDeviceUpdate) =>
    apiFetch<NetworkDevice>(`/network-devices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) => apiFetch<void>(`/network-devices/${id}`, { method: "DELETE" }),
};
