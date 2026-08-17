"use client";

import {
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { QueryError } from "@/components/layout/query-states";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SCOPES } from "@/lib/api/cache";
import { ApiError } from "@/lib/api/client";
import type { Attachment, DocType, SubjectType } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { DOC_TYPE_LABELS, DOC_TYPE_OPTIONS } from "@/lib/labels";
import { MAX_UPLOAD_BYTES, fileMatchesAccept } from "@/lib/uploads";

import { attachmentService } from "../api";
import { useAttachmentMutations } from "../hooks";

/**
 * The documents on any record — the two-step presign flow that has served the API since
 * Phase 0 (and through which the 171 migrated PDFs arrived). Upload registers metadata, PUTs
 * the bytes straight to storage, and refreshes; download mints a fresh short-lived URL per click.
 *
 * **Parameterised on subject, not copied per record type.** It takes a `(subjectType, subjectId)`
 * pair rather than a contract, so the contract detail page, the tenancy detail page and anything
 * else attach documents through one card. The SWR key is `[attachments, subjectType, subjectId]`,
 * which for a contract is byte-identical to `useContractAttachments`' key — so they share cache.
 *
 * **Extraction is an optional slot, not baked in.** A caller that can read a document into a
 * proposal passes an `extraction` config: which doc-type shows the button, whether the caller is
 * allowed to (a role gate mirroring the backend's), and how to render the review sheet. The card
 * owns the open/close state and always mounts the sheet so its exit animation survives.
 */
export type DocumentExtraction = {
  /** The doc-type whose rows show the "Extract details" button. */
  docType: DocType;
  /** The role/config gate — the button appears only when true, mirroring the API's gate. */
  enabled: boolean;
  /** Render the review sheet for the chosen attachment. Always called; `open` is presence. */
  renderReview: (args: {
    attachment: Attachment | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => React.ReactNode;
};

export function DocumentsCard({
  subjectType,
  subjectId,
  defaultDocType = "other",
  docTypeOptions = DOC_TYPE_OPTIONS,
  extraction,
  title = "Documents",
  emptyLabel = "No documents yet — drop the signed document here, or use Upload.",
  noun = "signed agreement",
  accept,
}: {
  subjectType: SubjectType;
  subjectId: string;
  defaultDocType?: DocType;
  docTypeOptions?: readonly { value: string; label: string }[];
  extraction?: DocumentExtraction;
  /** Card heading. A licence holds one authoritative "Certificate", not a "Documents" pile. */
  title?: string;
  /** Empty-state copy, matched to what this subject expects. */
  emptyLabel?: string;
  /** What one file *is*, for the delete confirm ("the only copy of the {noun}"). */
  noun?: string;
  /** File-type hint + client-side gate; see `lib/uploads`. Absent accepts anything (today's default). */
  accept?: string;
}) {
  const {
    data,
    error,
    isLoading,
  } = useSWR([SCOPES.attachments, subjectType, subjectId], () =>
    attachmentService.list(subjectType, subjectId),
  );
  const { upload, remove, download } = useAttachmentMutations();
  const [docType, setDocType] = React.useState<DocType>(defaultDocType);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [reviewing, setReviewing] = React.useState<Attachment | null>(null);
  const [deleting, setDeleting] = React.useState<Attachment | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const storageDark = error instanceof ApiError && error.status === 503;

  async function handleFiles(files: FileList | File[]) {
    const picked = [...files];
    if (picked.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of picked) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(
            `${file.name} is ${formatBytes(file.size)} — documents are capped at ` +
              `${formatBytes(MAX_UPLOAD_BYTES)}.`,
          );
          continue;
        }
        if (!fileMatchesAccept(file, accept)) {
          // `accept` is only a picker hint — drag-drop and "All files" bypass it, and the
          // backend does not restrict MIME, so this is the real gate.
          toast.error(`${file.name} isn't a supported file type here.`);
          continue;
        }
        try {
          await upload(file, subjectType, subjectId, docType);
          toast.success(`${file.name} uploaded`);
        } catch (uploadError) {
          toast.error(
            uploadError instanceof Error
              ? `${file.name}: ${uploadError.message}`
              : `${file.name} could not be uploaded`,
          );
        }
      }
    } finally {
      setIsUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const attachments = data?.items ?? [];

  return (
    <Card>
      {/* Stacks below sm so the doc-type select and Upload button never overflow a phone-width
          card — the grid `1fr auto` header clipped the button at 390px. */}
      <CardHeader className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileTextIcon aria-hidden className="size-4 text-ink-tertiary" />
          {title}
        </CardTitle>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <Select
            aria-label="Document type for uploads"
            value={docType}
            disabled={isUploading || storageDark}
            onChange={(event) => setDocType(event.target.value as DocType)}
            containerClassName="w-40"
          >
            {docTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={isUploading || storageDark}
            onClick={() => fileInput.current?.click()}
          >
            {isUploading ? (
              <>
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
                Uploading
              </>
            ) : (
              <>
                <UploadIcon data-icon="inline-start" />
                Upload
              </>
            )}
          </Button>
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            aria-label="Upload a document"
            accept={accept}
            onChange={(event) => event.target.files && handleFiles(event.target.files)}
          />
        </div>
      </CardHeader>
      <CardContent
        className="flex flex-col gap-3"
        onDragOver={(event) => {
          event.preventDefault();
          if (!storageDark) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!storageDark) void handleFiles(event.dataTransfer.files);
        }}
      >
        {storageDark ? (
          <p className="text-helper text-ink-secondary">
            Document storage isn&apos;t configured on this deployment, so files cannot be
            listed or uploaded. The record itself is unaffected.
          </p>
        ) : error ? (
          <QueryError error={error} />
        ) : isLoading ? (
          <p className="text-helper text-ink-secondary">Loading documents…</p>
        ) : attachments.length === 0 ? (
          <div
            className={`rounded-lg border border-dashed p-6 text-center text-helper ${
              isDragging
                ? "border-border-strong bg-surface-selected text-ink"
                : "border-border text-ink-secondary"
            }`}
          >
            {emptyLabel}
          </div>
        ) : (
          <ul
            className={`flex flex-col gap-2 rounded-lg ${
              isDragging ? "bg-surface-selected" : ""
            }`}
          >
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <span className="flex min-w-0 flex-col">
                  <button
                    type="button"
                    onClick={() => void download(attachment.id)}
                    className="truncate rounded-md text-left font-medium text-ink hover:text-brand hover:underline"
                  >
                    {attachment.filename}
                  </button>
                  <span className="text-helper text-ink-tertiary">
                    {DOC_TYPE_LABELS[attachment.doc_type]}
                    {attachment.size_bytes != null
                      ? ` · ${formatBytes(attachment.size_bytes)}`
                      : ""}
                    {` · ${formatDate(attachment.created_at.slice(0, 10))}`}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  {extraction &&
                  extraction.enabled &&
                  attachment.doc_type === extraction.docType ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReviewing(attachment)}
                    >
                      <SparklesIcon data-icon="inline-start" />
                      Extract details
                    </Button>
                  ) : null}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => void download(attachment.id)}
                  >
                    <DownloadIcon />
                    <span className="sr-only">Download {attachment.filename}</span>
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setDeleting(attachment)}
                  >
                    <Trash2Icon />
                    <span className="sr-only">Delete {attachment.filename}</span>
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {extraction?.renderReview({
        attachment: reviewing,
        open: reviewing !== null,
        onOpenChange: (next) => {
          if (!next) setReviewing(null);
        },
      })}

      <DeleteDocumentDialog
        attachment={deleting}
        noun={noun}
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        onConfirm={remove}
      />
    </Card>
  );
}

/**
 * Deleting a document drops the row and, best-effort, the object behind it — and for the
 * migrated book that object is the only copy of a signed agreement. Irreversible and one click
 * away, so it gets a confirm.
 */
function DeleteDocumentDialog({
  attachment,
  noun,
  open,
  onOpenChange,
  onConfirm,
}: {
  attachment: Attachment | null;
  noun: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [isPending, setIsPending] = React.useState(false);

  async function confirm() {
    if (!attachment) return;
    setIsPending(true);
    try {
      await onConfirm(attachment.id);
      toast.success(`${attachment.filename} deleted`);
      onOpenChange(false);
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error ? deleteError.message : "Could not delete the document",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>Delete this document?</AlertDialogTitle>
          <AlertDialogDescription>
            {attachment?.filename} is removed from the record and deleted from storage. If this
            is the only copy of the {noun}, it cannot be recovered.
          </AlertDialogDescription>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogClose render={<Button variant="secondary" disabled={isPending} />}>
            Cancel
          </AlertDialogClose>
          <Button variant="destructive" onClick={confirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
                Deleting
              </>
            ) : (
              "Delete document"
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
