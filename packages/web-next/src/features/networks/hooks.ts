"use client";

import * as React from "react";
import useSWR from "swr";

import { ApiError } from "@/lib/api/client";
import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type {
  NetworkDevice,
  NetworkDeviceCreate,
  NetworkDeviceUpdate,
  OutletNetworkCreate,
  OutletNetworkUpdate,
} from "@/lib/api/types";

import { deviceService, networkService, type NetworkRead } from "./api";

/**
 * Outlet wifi and hardware.
 *
 * `NetworkRead` is a union, because the API returns a different *shape* per caller: the ops team
 * gets password fields, everyone else gets a schema on which those fields do not exist. Narrow
 * with `hasSensitiveFields()` — never with a null test, since null means "no password recorded"
 * and absence means "not allowed to see it".
 */

// ── Networks ───────────────────────────────────────────────────────────────────────────

/**
 * The network record for one outlet, or `null` where there is none.
 *
 * A 404 here is an ordinary answer rather than a failure — most outlets have a network record,
 * pipeline sites do not yet, and a page that renders an error panel for "nothing installed" is
 * wrong. Every other status still throws, so a 403 on the sensitive shape stays visible.
 */
export function useOutletNetwork(outletId: string | undefined) {
  return useSWR(outletId ? [SCOPES.network, outletId] : null, async () => {
    try {
      return await networkService.forOutlet(outletId!);
    } catch (error) {
      if (error instanceof ApiError && error.isNotFound) return null;
      throw error;
    }
  });
}

export function useNetworks(params: Parameters<typeof networkService.list>[0] = {}) {
  return useSWR([SCOPES.networks, params], () => networkService.list(params));
}

export function useNetworkPages(params: Parameters<typeof networkService.list>[0] = {}) {
  return useCursorPages<NetworkRead>(SCOPES.networks, params, (cursor) =>
    networkService.list({ ...params, cursor }),
  );
}

export function useNetworkMutations() {
  const invalidate = useInvalidate();

  const create = React.useCallback(
    async (data: OutletNetworkCreate) => {
      const created = await networkService.create(data);
      await invalidate(SCOPES.networks, SCOPES.network);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: OutletNetworkUpdate) => {
      const updated = await networkService.update(id, data);
      await invalidate(SCOPES.networks, SCOPES.network);
      return updated;
    },
    [invalidate],
  );

  const remove = React.useCallback(
    async (id: string) => {
      await networkService.remove(id);
      await invalidate(SCOPES.networks, SCOPES.network);
    },
    [invalidate],
  );

  return { create, update, remove };
}

// ── Devices ────────────────────────────────────────────────────────────────────────────

export function useDevices(params: Parameters<typeof deviceService.list>[0] = {}) {
  return useSWR([SCOPES.devices, params], () => deviceService.list(params));
}

export function useDevicePages(params: Parameters<typeof deviceService.list>[0] = {}) {
  return useCursorPages<NetworkDevice>(SCOPES.devices, params, (cursor) =>
    deviceService.list({ ...params, cursor }),
  );
}

export function useDeviceMutations() {
  const invalidate = useInvalidate();

  const create = React.useCallback(
    async (data: NetworkDeviceCreate) => {
      const created = await deviceService.create(data);
      await invalidate(SCOPES.devices);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: NetworkDeviceUpdate) => {
      const updated = await deviceService.update(id, data);
      await invalidate(SCOPES.devices, SCOPES.device);
      return updated;
    },
    [invalidate],
  );

  const remove = React.useCallback(
    async (id: string) => {
      await deviceService.remove(id);
      await invalidate(SCOPES.devices, SCOPES.device);
    },
    [invalidate],
  );

  return { create, update, remove };
}
