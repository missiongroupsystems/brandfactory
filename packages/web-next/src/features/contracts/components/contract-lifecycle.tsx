"use client";

import { useRouter } from "next/navigation";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSubmit } from "@/hooks/use-submit";
import type { ContractStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { useContractMutations } from "../hooks";

/**
 * The one shape a decision hangs off, and the two controls that resolve it.
 *
 * This module exists because the same three facts were being asked in two places and answered
 * by two hand-written expressions — the detail page's `LifecycleCard` and the table's Status
 * cell — and because the table now offers the same two actions the detail page does. Two
 * expressions of one rule is how a row stops offering an action the page still offers; two
 * close-off dialogs is how one of them stops sending the reason.
 *
 * The predicate is the same shape as `notice_gap`'s, one release earlier: a rule with more than
 * one reader gets a name.
 */

/** Only the fields the rule reads, so a caller can pass a list row or a fetched record. */
type LifecycleFacts = {
  status: ContractStatus;
  renewed_by_id?: string | null;
  closed_at?: string | null;
};

/**
 * Expired, and nobody has said what happens next.
 *
 * Three facts, not one status. `expired` alone is *history* once it has been answered — the
 * renewal chain or the close-off record is the answer — and the backend keeps both on the row
 * rather than inventing a fifth status, because "expired and renewed" and "expired and closed
 * off" are different resolutions of the same end date and a status enum can only hold one of
 * them. This is the same set the obligation engine's `decision` generator raises work for, so a
 * row that reads as needing a decision here is a row the dashboard is already counting.
 */
export function needsDecision(contract: LifecycleFacts): boolean {
  return (
    contract.status === "expired" && !contract.renewed_by_id && !contract.closed_at
  );
}

/**
 * Renew and Close off, wherever a contract needs them.
 *
 * `compact` is the table row: `xs` buttons and no explanatory prose, because the column has
 * ~150px and the row's own Ends date already says why. Everything else — which mutation, what
 * the toast says, where a failure surfaces — is identical, which is the point of one component.
 *
 * **Renew does not navigate here.** On the detail page it does (`LifecycleCard`), and that is
 * right: the reader is already inside one record and the draft is the next thing they will edit.
 * On the table it would be wrong — the whole reason these buttons exist on the row is that the
 * reader asked not to be sent into a record to resolve one, and sending them into a *different*
 * record instead is the same interruption wearing a different hat. Somebody working down a
 * filtered list of expiries wants to stay on the list. So the draft is announced by a toast that
 * carries the way into it, and the row is left behind resolved.
 *
 * A draft nobody opens is the real risk of not navigating, which is why the toast's action is a
 * link to it and not merely a confirmation. The draft is also not silent elsewhere: it lands on
 * `/contracts` as a `draft` row and its predecessor's decision obligation clears on the next
 * generate run.
 */
export function DecisionActions({
  contract,
  compact,
}: {
  contract: { id: string; title?: string };
  /** Table-row sizing and toast-only errors. Omit for the detail page's card. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { renew } = useContractMutations();
  const { run, isPending, formError } = useSubmit();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  async function handleRenew() {
    await run(async () => {
      const draft = await renew(contract.id);
      if (compact) {
        toast.success("Draft renewal created", {
          description: contract.title,
          action: {
            label: "Open draft",
            onClick: () => router.push(`/contracts/${draft.id}`),
          },
        });
        return;
      }
      toast.success("Draft renewal created");
      router.push(`/contracts/${draft.id}`);
    });
  }

  const size = compact ? "xs" : "default";

  return (
    <>
      {/* A `role=group` with a name, because in the compact case these two buttons are the
          *only* thing in the Status cell: the words "Needs decision" are gone and a reader
          arriving by Tab would otherwise meet a bare "Renew" with nothing saying what it is
          renewing or why it is offered. The visible carrier is the ochre Renew button beside a
          quiet Close off, in a table where ochre has meant "this will cost you" since 0.8.0. */}
      <div
        role="group"
        aria-label={
          compact ? "Expired with no decision recorded" : "Resolve this expiry"
        }
        // `flex-nowrap` in the table and `flex-wrap` in the card, and this is not a
        // preference. A table cell is sized by its content, so a wrapping pair inside one
        // negotiates with every other column and loses: at 1280 the Status column settled
        // narrower than "Renew" + "Close off" and stacked them, which made those rows two
        // lines tall and read as a rendering fault rather than as two controls. Held on one
        // line the column simply asks for the ~150px it needs. The card has the full page
        // width and no such negotiation, so wrapping there is the safe behaviour it always
        // was. Found by looking at the rendered table; no gate could see it.
        className={cn(
          "flex items-center gap-1.5",
          compact ? "flex-nowrap" : "flex-wrap",
        )}
      >
        <Button
          size={size}
          variant={compact ? "secondary" : "default"}
          disabled={isPending}
          onClick={handleRenew}
          // Ochre on the compact button and only there. The detail page's Renew is that view's
          // one accent button (§4's budget, one per view); thirty accent buttons down a table
          // would blow that budget thirty times and read as thirty primary actions on one
          // screen. The warning tint is the same ink the row's other unresolved states use.
          className={
            compact
              ? "border-warning/25 bg-warning-tint text-warning hover:bg-warning/15"
              : undefined
          }
        >
          {isPending ? (
            <>
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
              {compact ? "Renewing" : "Creating draft"}
            </>
          ) : (
            <>
              <RefreshCwIcon data-icon="inline-start" />
              Renew
            </>
          )}
        </Button>
        <Button
          size={size}
          variant={compact ? "ghost" : "secondary"}
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
        >
          Close off
        </Button>
      </div>

      {/* A table cell has no room for a paragraph, and a `role=alert` that widens one column
          would shift every row beside it. `useSubmit` still holds the error — it is surfaced as
          a toast instead, which is the only place on a list screen that can hold a sentence. */}
      {formError ? (
        compact ? (
          <ToastOnce message={formError} />
        ) : (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        )
      ) : null}

      <CloseOutDialog
        contractId={contract.id}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      />
    </>
  );
}

/**
 * Renders nothing and fires one toast for the message it is handed.
 *
 * The effect is the honest shape here: `useSubmit` owns the error state (so that the detail
 * page can render it inline from the same hook), and the compact case needs that state
 * *announced* rather than laid out. Keyed on the message so a second, different failure toasts
 * again and an unchanged one does not — this is a `useEffect` calling a side effect, not the
 * `setState`-in-effect pattern that has broken this build before.
 */
function ToastOnce({ message }: { message: string }) {
  React.useEffect(() => {
    toast.error(message);
  }, [message]);
  return null;
}

/**
 * Close-off confirm: the one dialog in the lifecycle flow, because it records a decision rather
 * than opening a draft someone can still abandon.
 *
 * Shared by the detail page's card and the table row. The reason field is why it may not be
 * duplicated per surface: a close-off recorded from the table with no way to say *why* would be
 * a worse record than the one made from the page, and a reader would have no way to know which
 * surface a reason-less row came from.
 */
export function CloseOutDialog({
  contractId,
  open,
  onOpenChange,
}: {
  contractId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { closeOut } = useContractMutations();
  const { run, isPending, formError } = useSubmit();
  const [reason, setReason] = React.useState("");
  // Adjust-on-open (the AGENTS.md draft-reset pattern): a reason typed into a
  // cancelled dialog must not leak into the next opening.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  async function confirm() {
    await run(async () => {
      await closeOut(contractId, { reason: reason.trim() || null });
      toast.success("Contract closed off");
      onOpenChange(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>Close off this contract?</AlertDialogTitle>
          <AlertDialogDescription>
            Records that this expired contract is not being replaced. The decision
            obligation clears on the next generate run, and the contract moves out of
            the current view. A wrong close-off is undone by renewing anyway.
          </AlertDialogDescription>
        </div>

        <label className="flex flex-col gap-1.5 text-sm text-ink">
          Reason <span className="text-helper text-ink-tertiary">(optional)</span>
          <Textarea
            value={reason}
            disabled={isPending}
            onChange={(event) => setReason(event.target.value)}
            placeholder="No longer required, consolidated into the group contract…"
            rows={3}
          />
        </label>

        {formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogClose render={<Button variant="secondary" disabled={isPending} />}>
            Cancel
          </AlertDialogClose>
          <Button onClick={confirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
                Closing off
              </>
            ) : (
              "Close off"
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
