"use client";

import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { FormSubmission } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";

import {
  MARKETING_REQUEST_FORM,
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_TONES,
  type SubmissionStatus,
} from "../fixture";
import { useRequestMutations } from "../hooks";

/**
 * One request in full — **the filled-in form**, which is the other half of "click to see the
 * form". The table shows the five facts that make a queue readable; everything the person
 * actually wrote is here.
 *
 * **It renders the form's field order, not the payload's key order.** A payload is
 * `{label: value}` with no ordering guarantee and no record of what was left blank, so reading
 * it directly would shuffle the answers between rows and silently drop the questions nobody
 * answered. Walking `MARKETING_REQUEST_FORM.fields` instead means every request reads in the
 * order it was asked, and an unanswered optional field shows as an em dash rather than as
 * absence — which is a different fact and worth seeing.
 *
 * The two facts that are *not* payload — reference and received-at — sit in the header, because
 * they are the row's identity rather than anybody's answer.
 */
export function RequestSheet({
  submission,
  open,
  onOpenChange,
}: {
  submission?: FormSubmission;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setStatus } = useRequestMutations();

  if (!submission) return null;

  const status = submission.status as SubmissionStatus;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Keyed on the submission's own id, which never changes while the sheet is dismissing.
          Keying on anything that clears on close jams Base UI's exit animation and leaves the
          overlay eating clicks — see AGENTS.md. */}
      <SheetContent size="wide" key={submission.id}>
        <SheetHeader>
          <SheetTitle>{submission.summary}</SheetTitle>
          <SheetDescription>
            <span className="font-mono">{submission.reference}</span> · received{" "}
            {formatDateTime(submission.created_at)}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-6">
          {/* The status is a control here as well as in the table, and deliberately so: the
              sheet is where a request is read closely enough to decide, and making the reader
              close it to act on what they just read is the one step this screen exists to
              remove. Both controls call the same mutation. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-sunken p-3">
            <span className="flex items-center gap-2 text-helper text-ink-secondary">
              Status
              <Badge variant={SUBMISSION_STATUS_TONES[status]}>
                {SUBMISSION_STATUS_LABELS[status]}
              </Badge>
            </span>
            <Select
              containerClassName="w-44"
              aria-label={`Status of ${submission.reference}`}
              value={status}
              onChange={(event) =>
                void setStatus(submission.id, event.target.value as SubmissionStatus)
              }
            >
              {SUBMISSION_STATUSES.map((key) => (
                <option key={key} value={key}>
                  {SUBMISSION_STATUS_LABELS[key]}
                </option>
              ))}
            </Select>
          </div>

          <DetailList>
            {MARKETING_REQUEST_FORM.fields.map((field) => (
              <DetailItem
                key={field.label}
                label={field.label}
                span={field.full || field.type === "textarea"}
              >
                {read(submission, field.label, field.type === "date")}
              </DetailItem>
            ))}
          </DetailList>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/**
 * One answer, formatted by the question's type.
 *
 * `undefined` rather than an empty string for a blank, because `DetailItem` renders through
 * `Value`, which is the component that decides what "nothing" looks like — one em dash, in one
 * place, rather than a different placeholder per screen.
 */
function read(submission: FormSubmission, label: string, isDate: boolean) {
  const value = submission.payload[label];
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return isDate ? formatDate(value) : value;
}
