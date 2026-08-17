import { apiFetch } from "@/lib/api/client";
import type { Settings, SettingsUpdate } from "@/lib/api/types";

/**
 * Operator-tunable settings — the small key/value surface over the backend's `app_setting`.
 * One key today: `license_expiry_buffer_days`, the days added to a licence type's renewal
 * lead time before a held licence reads as expiring.
 */
export const settingsService = {
  get: () => apiFetch<Settings>("/settings"),

  update: (data: SettingsUpdate) =>
    apiFetch<Settings>("/settings", { method: "PATCH", body: JSON.stringify(data) }),
};
