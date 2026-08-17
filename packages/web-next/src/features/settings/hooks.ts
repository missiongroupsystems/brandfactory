"use client";

import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import type { SettingsUpdate } from "@/lib/api/types";

import { settingsService } from "./api";

/** The effective settings. Cached, revalidated — a plain read of one small object. */
export function useSettings() {
  return useSWR([SCOPES.settings], () => settingsService.get());
}

// A settings write moves the licence-expiry buffer, which re-decides the live Expiring tab
// (`licenses-expiring`) for everyone. It does **not** touch stored statuses until the next
// sweep, so it does not invalidate the held-licences list. Nothing optimistic: the API
// validates the bound and its answer is the value worth rendering.
const SETTINGS_SCOPES = [SCOPES.settings, SCOPES.licensesExpiring];

export function useSettingsMutations() {
  const invalidate = useInvalidate();

  const update = React.useCallback(
    async (data: SettingsUpdate) => {
      const updated = await settingsService.update(data);
      await invalidate(...SETTINGS_SCOPES);
      return updated;
    },
    [invalidate],
  );

  return { update };
}
