"use client";

import * as React from "react";
import useSWR from "swr";

import { SCOPES, useInvalidate } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type {
  ContractCloseOutBody,
  ContractCreate,
  ContractRenewBody,
  ContractUpdate,
  DocType,
  SubjectType,
} from "@/lib/api/types";

import {
  attachmentService,
  contractService,
  type ContractFilters,
  type ContractRecord,
} from "./api";

// ── Contracts ──────────────────────────────────────────────────────────────────────────

export function useContractPages(filters: ContractFilters = {}) {
  return useCursorPages<ContractRecord>(SCOPES.contracts, filters, (cursor) =>
    contractService.list({ ...filters, cursor }),
  );
}

export function useContracts(filters: ContractFilters = {}) {
  return useSWR([SCOPES.contracts, filters], () => contractService.list(filters));
}

export function useContract(id: string | undefined) {
  return useSWR(id ? [SCOPES.contract, id] : null, () => contractService.get(id!));
}

/** One vendor's agreements, for the Contracts card on `/vendors/[id]`.
 *
 * Lives here rather than in `features/registry-vendors` because it fetches *contracts* filtered by
 * vendor; the Operations Hub's vendor book imports it across the boundary. A copy over there is how two
 * definitions of "this vendor's contracts" start.
 *
 * `view: "all"` is load-bearing, not decoration: the section's own header comes from
 * the backend's vendor aggregates, which count every contract, and `VendorListItem`
 * promises the two never disagree. Left at the API default (`current`) this list
 * renders one row under a heading saying "1 active of 5".
 *
 * The null key is kept although the page that reads this is always "open" — an SWR array
 * key is truthy however empty its contents, so `[scope, "by-vendor", ""]` would fetch and
 * take a 422 on every render. */
export function useVendorContracts(vendorId: string | undefined) {
  return useSWR(vendorId ? [SCOPES.contracts, "by-vendor", vendorId] : null, () =>
    contractService.list({ vendor_id: vendorId!, limit: 200, view: "all" }),
  );
}

/** Every contract, cached, for pickers (the network form's ISP link) and name lookups.
 *
 * `view: "all"`: an index that silently omits records is worse than no index. A network
 * linked to an ISP contract since terminated or renewed would find no option matching
 * its value in the picker, and a native select with no matching option renders as
 * "Not linked" over a link that is really there. */
export function useContractIndex() {
  const { data, error, isLoading } = useSWR(
    [SCOPES.contracts, "index"],
    () => contractService.list({ limit: 200, view: "all" }),
    { revalidateOnFocus: false },
  );

  const byId = React.useMemo(() => {
    const map = new Map<string, ContractRecord>();
    for (const contract of data?.items ?? []) map.set(contract.id, contract);
    return map;
  }, [data]);

  return { contracts: data?.items ?? [], byId, error, isLoading };
}

// A contract write can move the dashboard (notice deadlines) and the vendor aggregates,
// which are counted over the agreements themselves — `contracts_active`, `brands_covered`
// and `next_contract_end` all change when a contract does.
//
// The two service scopes that used to ride along are gone with the workflow they invalidated.
const CONTRACT_SCOPES = [
  SCOPES.contracts,
  SCOPES.contract,
  SCOPES.registryVendors,
  SCOPES.registryVendor,
  SCOPES.dashboard,
];

export function useContractMutations() {
  const invalidate = useInvalidate();

  const create = React.useCallback(
    async (data: ContractCreate) => {
      const created = await contractService.create(data);
      await invalidate(...CONTRACT_SCOPES);
      return created;
    },
    [invalidate],
  );

  const update = React.useCallback(
    async (id: string, data: ContractUpdate) => {
      const updated = await contractService.update(id, data);
      await invalidate(...CONTRACT_SCOPES);
      return updated;
    },
    [invalidate],
  );

  const replaceBrands = React.useCallback(
    async (id: string, brandIds: string[]) => {
      const updated = await contractService.replaceBrands(id, brandIds);
      await invalidate(...CONTRACT_SCOPES);
      return updated;
    },
    [invalidate],
  );

  const remove = React.useCallback(
    async (id: string) => {
      await contractService.remove(id);
      // Deleting an abandoned renewal draft frees its predecessor's decision
      // obligation on the next generate run — the obligations scope rides along so
      // the dashboard is not left showing a resolution that no longer holds.
      await invalidate(...CONTRACT_SCOPES, SCOPES.obligations);
    },
    [invalidate],
  );

  // Lifecycle resolutions move the dashboard's decision obligations as well as every
  // contract surface.
  const renew = React.useCallback(
    async (id: string, data: ContractRenewBody = {}) => {
      const draft = await contractService.renew(id, data);
      await invalidate(...CONTRACT_SCOPES, SCOPES.obligations);
      return draft;
    },
    [invalidate],
  );

  const closeOut = React.useCallback(
    async (id: string, data: ContractCloseOutBody = {}) => {
      const closed = await contractService.closeOut(id, data);
      await invalidate(...CONTRACT_SCOPES, SCOPES.obligations);
      return closed;
    },
    [invalidate],
  );

  return { create, update, replaceBrands, renew, closeOut, remove };
}

// ── Documents ──────────────────────────────────────────────────────────────────────────

/** `contractId` empty means "do not ask" — a null SWR key, not a request with a blank id.
 * The review queue's delete dialog only wants the sibling documents while it is open, and
 * an array key is truthy however empty its contents, so passing `""` through fetched
 * `/attachments?subject_type=contract` with no `subject_id` and took a 422 on every render. */
export function useContractAttachments(contractId: string) {
  return useSWR(contractId ? [SCOPES.attachments, "contract", contractId] : null, () =>
    attachmentService.list("contract", contractId),
  );
}

export function useAttachmentMutations() {
  const invalidate = useInvalidate();

  /** The whole two-step flow as one call: register, PUT the bytes, refresh the list.
   * If the PUT fails the metadata row is a harmless orphan (the backend's words) —
   * surfaced to the user as the upload failing, retried by uploading again. */
  const upload = React.useCallback(
    async (file: File, subjectType: SubjectType, subjectId: string, docType: DocType) => {
      const contentType = file.type || "application/octet-stream";
      const ticket = await attachmentService.create({
        subject_type: subjectType,
        subject_id: subjectId,
        doc_type: docType,
        filename: file.name,
        content_type: contentType,
        size_bytes: file.size,
      });
      await attachmentService.uploadBytes(ticket.upload_url, file, contentType);
      await invalidate(SCOPES.attachments);
      return ticket.attachment;
    },
    [invalidate],
  );

  const remove = React.useCallback(
    async (id: string) => {
      await attachmentService.remove(id);
      await invalidate(SCOPES.attachments);
    },
    [invalidate],
  );

  /** Re-type or rename a filed document. Used by the review queue to clear
   * `document_type_unconfirmed` — the parent record is untouched, so only the attachment
   * scope moves. */
  const update = React.useCallback(
    async (id: string, data: { doc_type?: DocType; filename?: string }) => {
      const updated = await attachmentService.update(id, data);
      await invalidate(SCOPES.attachments);
      return updated;
    },
    [invalidate],
  );

  /** Mints a short-lived signed URL and hands it to the browser. Not cached — every
   * click gets a fresh URL, because the old one may already have expired.
   *
   * A synthetic anchor with no `target`, not `window.open`: the URL only arrives after
   * an await, by which point the click's transient activation may be gone and Safari
   * and Firefox block the popup. Navigation is safe here because `presign_download`
   * signs in a `Content-Disposition: attachment`, so the browser downloads the file
   * and never leaves the page. */
  const download = React.useCallback(async (id: string) => {
    const { url } = await attachmentService.downloadUrl(id);
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  }, []);

  return { upload, update, remove, download };
}
