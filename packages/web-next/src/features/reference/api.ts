import { apiFetch } from "@/lib/api/client";
import type { LibraryMeta, OutletAttributeDefinition } from "@/lib/api/types";

/**
 * Reference data from the license library, served straight out of
 * `seeds/license_types.json` rather than a table.
 *
 * The outlet attribute checkboxes and the library's `required_when` expressions have to
 * agree, and they agree by construction because both read the same file. Hardcoding the
 * twenty keys in the frontend would be the exact drift this avoids.
 */

export type OutletAttributesResponse = {
  attributes: OutletAttributeDefinition[];
  meta: LibraryMeta;
};

export const referenceService = {
  outletAttributes: () => apiFetch<OutletAttributesResponse>("/reference/outlet-attributes"),
  confidenceLevels: () => apiFetch<Record<string, string>>("/reference/confidence-levels"),
};
