"use client";

import type {
  MarketingRequest,
  MarketingRequestStatus,
  UpdateMarketingRequestInput,
} from "@brandfactory/shared";
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

import { usePeople, useRequestMutations } from "../hooks";

/** The branded id the patch wants, named once so the cast below reads as one. */
type AssigneeId = NonNullable<UpdateMarketingRequestInput["assigneeUserId"]>;
import { REQUEST_STATUSES, assigneeOptions, assigneePatch, personLabel } from "../inbox";

/**
 * One request in full, with the two things the inbox does to it: move it along the ladder, and
 * decide who is doing it — either by taking it ("Assign to me") or by handing it to a colleague
 * from the picker.
 *
 * **The picker reads `GET /workspaces/:id/people`, not `GET /members`.** That second route is
 * admin-only by its mount in `app.ts`, so a picker built on it would 403 for the first person
 * added as an ordinary member — which is the case the member work exists for. See
 * `packages/server/src/routes/people.ts`.
 *
 * **"Assign to me" stays beside it.** It is one click for the common case and it works while the
 * people list is still loading or has failed; removing it to avoid two paths to one field would
 * make the frequent action slower to serve a tidiness nobody asked for.
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
  const { people } = usePeople();
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
  // An assignee the list cannot show — somebody deactivated since they took it — still has to
  // render as the selected option, or the control would read as "Unassigned" over a request that
  // is assigned, and saving any other field would look like it cleared the assignment.
  const options = assigneeOptions(
    request.assignee && !people.some((p) => p.id === request.assignee?.id)
      ? [...people, request.assignee]
      : people,
    meId,
  );

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
            <span className="flex flex-wrap items-center gap-2">
              <Select
                containerClassName="w-52"
                aria-label={`Assignee of ${request.reference}`}
                value={request.assignee?.id ?? ""}
                // Disabled while a write is in flight, and while the list is empty — which is
                // both "still loading" and "the read failed". The two buttons stay enabled in
                // either case, because neither needs the list.
                disabled={pending !== null || people.length === 0}
                onChange={(event) => {
                  // The one cast, at the DOM boundary: a `<select>` value is a plain string and
                  // `assigneeUserId` is a branded `UserId`. The server re-checks the id either
                  // way — `assertAssignable` refuses one with no active account behind it.
                  const raw = event.target.value;
                  const chosen = raw === "" ? null : (raw as AssigneeId);
                  const patch = assigneePatch(request, chosen);
                  // Choosing the row already set sends nothing: the patch schema refuses `{}`,
                  // and an unchanged write would put back a value a colleague may have altered.
                  if (patch) void save("assignee", patch);
                }}
              >
                {options.map((option) => (
                  <option key={option.id ?? "none"} value={option.id ?? ""}>
                    {option.label}
                  </option>
                ))}
              </Select>
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
            </span>
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
