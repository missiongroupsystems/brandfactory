"use client";

import type { MarketingRequest, MarketingRequestStatus } from "@brandfactory/shared";
import { Loader2Icon, UserCheckIcon, UserMinusIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  MARKETING_REQUEST_PRIORITY_LABELS,
  MARKETING_REQUEST_STATUS_LABELS,
  MARKETING_REQUEST_STATUS_TONES,
  MARKETING_REQUEST_TYPE_LABELS,
} from "@/lib/labels";

import { useRequestMutations } from "../hooks";
import { REQUEST_STATUSES, personLabel } from "../inbox";

/**
 * One request in full, with the two things the inbox does to it: move it along the ladder, and
 * take it ("Assign to me"). Assigning anybody else waits for a route that lists the workspace's
 * people; until then, the person who will do the work takes it.
 *
 * **Nothing optimistic.** A control in flight is disabled and shows the value the request still
 * holds; the new value appears because the server sent it back. A refusal is a toast carrying the
 * server's own sentence.
 */
export function RequestSheet({
  request,
  brandName,
  outletName,
  meId,
  open,
  onOpenChange,
}: {
  request?: MarketingRequest;
  brandName: string;
  outletName: string | undefined;
  /** The signed-in user's id. `undefined` while `/me` loads, which disables "Assign to me". */
  meId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { update } = useRequestMutations();
  const [pending, setPending] = React.useState<"status" | "assignee" | null>(null);

  if (!request) return null;

  async function save(kind: "status" | "assignee", patch: Parameters<typeof update>[1]) {
    if (!request) return;
    setPending(kind);
    try {
      await update(request.id, patch);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That change did not save.");
    } finally {
      setPending(null);
    }
  }

  const mine = meId !== undefined && request.assignee?.id === meId;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Keyed on the request's own id, which never changes while the sheet is dismissing. */}
      <SheetContent size="wide" key={request.id}>
        <SheetHeader>
          <SheetTitle>{request.summary}</SheetTitle>
          <SheetDescription>
            <span className="font-mono">{request.reference}</span> · from{" "}
            {personLabel(request.requestedBy)} · received {formatDateTime(request.createdAt)}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-sunken p-3">
            <span className="flex items-center gap-2 text-helper text-ink-secondary">
              Status
              <Badge variant={MARKETING_REQUEST_STATUS_TONES[request.status]}>
                {MARKETING_REQUEST_STATUS_LABELS[request.status]}
              </Badge>
              {pending === "status" ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
            </span>
            <Select
              containerClassName="w-44"
              aria-label={`Status of ${request.reference}`}
              value={request.status}
              disabled={pending !== null}
              onChange={(event) =>
                void save("status", { status: event.target.value as MarketingRequestStatus })
              }
            >
              {REQUEST_STATUSES.map((key) => (
                <option key={key} value={key}>
                  {MARKETING_REQUEST_STATUS_LABELS[key]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle p-3">
            <span className="text-helper text-ink-secondary">
              Assigned to{" "}
              <span className="font-medium text-ink">
                {request.assignee ? (mine ? "you" : personLabel(request.assignee)) : "nobody yet"}
              </span>
            </span>
            {mine ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending !== null}
                onClick={() => void save("assignee", { assigneeUserId: null })}
              >
                {pending === "assignee" ? (
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                ) : (
                  <UserMinusIcon data-icon="inline-start" />
                )}
                Unassign me
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending !== null || meId === undefined}
                onClick={() =>
                  void save("assignee", {
                    assigneeUserId: meId as NonNullable<
                      Parameters<typeof update>[1]["assigneeUserId"]
                    >,
                  })
                }
              >
                {pending === "assignee" ? (
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                ) : (
                  <UserCheckIcon data-icon="inline-start" />
                )}
                {request.assignee ? "Take it over" : "Assign to me"}
              </Button>
            )}
          </div>

          <DetailList>
            <DetailItem label="Brand">{brandName}</DetailItem>
            <DetailItem label="Outlet">{outletName ?? "The whole brand"}</DetailItem>
            <DetailItem label="Request type">
              {MARKETING_REQUEST_TYPE_LABELS[request.type]}
            </DetailItem>
            <DetailItem label="Priority">
              {MARKETING_REQUEST_PRIORITY_LABELS[request.priority]}
            </DetailItem>
            <DetailItem label="Needed by">
              {request.neededBy ? formatDate(request.neededBy) : undefined}
            </DetailItem>
            <DetailItem label="Closed">
              {request.resolvedAt ? formatDateTime(request.resolvedAt) : undefined}
            </DetailItem>
            <DetailItem label="Details" span>
              {request.details ? (
                <span className="whitespace-pre-wrap">{request.details}</span>
              ) : undefined}
            </DetailItem>
          </DetailList>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
