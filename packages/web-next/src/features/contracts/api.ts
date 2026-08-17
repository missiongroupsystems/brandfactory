import { apiFetch, query } from "@/lib/api/client";
import type {
  Attachment,
  AttachmentCreate,
  AttachmentDownload,
  AttachmentUploadTicket,
  DocType,
  Contract,
  ContractCategory,
  ContractCloseOutBody,
  ContractCreate,
  ContractExtractionResponse,
  ContractRenewBody,
  ContractSensitive,
  ContractStatus,
  ContractUpdate,
  ContractView,
  Page,
  RenewalType,
} from "@/lib/api/types";

/**
 * The agreements. Contract responses arrive as one of two shapes — narrow with
 * `hasContractValue()`, never a null test, same discipline as the network passwords.
 *
 * The vendors themselves live in `features/vendors`; a contract references one by
 * `vendor_id` and this file never fetches it. The brands live in
 * `features/registry-brands`, referenced by `brand_ids` and fetched no differently.
 *
 * **The service workflow used to live here too** — schedules, visits, reports and the
 * health verdict — and is gone rather than moved. Every one of those was keyed on a
 * `(contract, outlet)` pair, and a contract no longer names an outlet.
 */

export type ContractRecord = Contract | ContractSensitive;

export type ContractFilters = {
  vendor_id?: string;
  category?: ContractCategory;
  status?: ContractStatus;
  renewal_type?: RenewalType;
  /**
   * Agreements held for this brand.
   *
   * **One hop, off the row's own `brand_ids`.** It was two — the contract carried outlets,
   * the outlet carried a `brand_id`, and the API joined through the coverage — which made
   * the answer derived, permanently partial while an index was in flight, and empty for as
   * long as the estate was unattributed. A contract held for two brands still answers under
   * either of them; that part is unchanged and is the reason this is not an equality test.
   */
  brand_id?: string;
  q?: string;
  /**
   * Only contracts that auto-renew with no notice period — the review queue's
   * `contract_notice_period_missing` rows, from the same backend predicate.
   *
   * **`true` or absent, never `false`.** `query()` stringifies whatever it is given, so a
   * `false` here becomes a literal `?notice_gap=false` — which the API reads as "do not
   * narrow" and so is harmless, but it is a filter that *looks* set in a shared link and
   * is not. The caller passes `undefined` to turn it off.
   */
  notice_gap?: true;
  /** Omitted means the API default, `current` — live work only. */
  view?: ContractView;
  cursor?: string;
  limit?: number;
};

export const contractService = {
  list: (params: ContractFilters = {}) =>
    apiFetch<Page<ContractRecord>>(`/contracts${query(params)}`),

  get: (id: string) => apiFetch<ContractRecord>(`/contracts/${id}`),

  create: (data: ContractCreate) =>
    apiFetch<ContractRecord>("/contracts", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: ContractUpdate) =>
    apiFetch<ContractRecord>(`/contracts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** PUT — the complete brand set, not a patch. Was `replaceOutlets` against
   *  `/contracts/{id}/outlets`; the verb and the shape are unchanged, only the dimension. */
  replaceBrands: (id: string, brandIds: string[]) =>
    apiFetch<ContractRecord>(`/contracts/${id}/brands`, {
      method: "PUT",
      body: JSON.stringify({ brand_ids: brandIds }),
    }),

  /** Creates and returns the linked draft successor — the response is the page to
   * navigate to, not a patch on the predecessor. */
  renew: (id: string, data: ContractRenewBody = {}) =>
    apiFetch<ContractRecord>(`/contracts/${id}/renew`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Records "expired and not being replaced, on purpose". */
  closeOut: (id: string, data: ContractCloseOutBody = {}) =>
    apiFetch<ContractRecord>(`/contracts/${id}/close-out`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Ask the backend to read a contract-type attachment and propose the terms it
   * contains. A proposal, not a write — applying it is the ordinary PATCH. */
  extract: (id: string, attachmentId: string) =>
    apiFetch<ContractExtractionResponse>(`/contracts/${id}/extract`, {
      method: "POST",
      body: JSON.stringify({ attachment_id: attachmentId }),
    }),

  remove: (id: string) => apiFetch<void>(`/contracts/${id}`, { method: "DELETE" }),
};

export const attachmentService = {
  list: (subjectType: string, subjectId: string) =>
    apiFetch<Page<Attachment>>(
      `/attachments${query({ subject_type: subjectType, subject_id: subjectId, limit: 200 })}`,
    ),

  /** Step 1 of the two-step upload: register metadata, receive a presigned PUT. */
  create: (data: AttachmentCreate) =>
    apiFetch<AttachmentUploadTicket>("/attachments", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /**
   * Step 2: the bytes go straight to object storage — the API never proxies file
   * content. A raw fetch, not `apiFetch`: the URL is not ours and carries its own
   * auth in the signature. The Content-Type must match what step 1 declared, because
   * it is part of that signature.
   */
  uploadBytes: async (uploadUrl: string, file: File, contentType: string) => {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`The storage provider refused the upload (${response.status}).`);
    }
  },

  /**
   * Re-type or rename a filed document.
   *
   * `subject_type` and `subject_id` are **not** accepted by the API, deliberately:
   * repointing a row at a different parent moves the file from under one permission check
   * to another while looking like a one-field edit. Moving a document between records is
   * download → delete → re-upload, which is visibly destructive and therefore honest.
   */
  update: (id: string, data: { doc_type?: DocType; filename?: string }) =>
    apiFetch<Attachment>(`/attachments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  downloadUrl: (id: string) =>
    apiFetch<AttachmentDownload>(`/attachments/${id}/download`),

  remove: (id: string) => apiFetch<void>(`/attachments/${id}`, { method: "DELETE" }),
};
