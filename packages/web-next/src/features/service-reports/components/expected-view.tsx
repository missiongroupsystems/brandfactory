"use client";

import Link from "next/link";
import * as React from "react";

import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { TableCard } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useContractIndex, useServiceHealth } from "@/features/contracts/hooks";
import { useOutletIndex } from "@/features/registry/hooks";
import type { ContractHealth, Outlet } from "@/lib/api/types";
import type { ContractRecord } from "@/features/contracts/api";
import { formatDate, PENDING } from "@/lib/format";
import { SERVICE_FREQUENCY_LABELS } from "@/lib/labels";

import { useAwaitingDocument } from "../hooks";
import { FileReportSheet, type FileReportPrefill } from "./file-report-sheet";

/**
 * **Expected** — the worklist. Every (contract, outlet) pair on a cadence, overdue first.
 *
 * This was `features/contracts/components/service-health-view.tsx`, a tab on `/contracts`
 * answering "are we getting what we pay for". It moved here and gained the one thing that made
 * it a nav item rather than a tab: **an action on every row.** 0.13.0's rule for what deserves a
 * page — a different noun, or a view with work in it — is the same rule, and service health
 * failed it only because reading the verdict was all you could do.
 *
 * The API orders it overdue-first, most overdue at the top, and this table keeps that order (the
 * no-sorting rule is about paginated lists; `/service-health` returns the whole verdict in one
 * response, so there is no page two for a sort to lose rows behind).
 */
export function ExpectedView() {
  const { data, error, isLoading } = useServiceHealth();
  const { byId: contractById, contracts, isLoading: contractsLoading } = useContractIndex();
  const { byId: outletById } = useOutletIndex();
  // Read at the top of the component rather than inside the sentence that renders it: a hook
  // mounted in the table branch unmounts every time `useInvalidate` clears the health scope,
  // which is the shape that cost Stage 6 its success panel. A count has no state to lose, but
  // the rule is cheaper to keep than to remember the exception to.
  const awaiting = useAwaitingDocument();
  // The row that asked to file, or nothing. Held as the prefill itself rather than as a boolean
  // plus two ids, so the sheet cannot be opened with half a pair.
  const [filing, setFiling] = React.useState<FileReportPrefill | null>(null);

  /**
   * The honesty line's second number: **active contracts with no cadence at all.**
   *
   * Derived, not written down — and that is a deliberate departure from the plan, which asks
   * for Stage 0's literals ("41 … 33 more"). A number typed into a sentence on screen is wrong
   * the first time somebody sets a cadence, and this is the one line whose whole job is to be
   * accurate: it is what lets a reader tell *nothing is due* from *nothing is being watched*.
   *
   * Both halves come from the two things this page already fetches, so the sentence cannot
   * disagree with the table above it: the pairs are `data.length`, and a contract is cadence-less
   * when it is active and no pair in `data` names it. `/service-health` returns every active
   * schedule on an active contract, so absence from it is exactly the fact being counted.
   *
   * ⚠️ **Null while the contract index is in flight**, and the sentence goes with it. A count
   * derived from a half-loaded map is the failure `AGENTS.md` calls worse than a missing name:
   * "74 contracts have no cadence" is a false statement that looks like a true one.
   */
  const withoutCadence = React.useMemo(() => {
    if (contractsLoading || data === undefined) return null;
    const scheduled = new Set(data.map((health) => health.contract_id));
    return contracts.filter(
      (contract) => contract.status === "active" && !scheduled.has(contract.id),
    ).length;
  }, [contracts, contractsLoading, data]);

  /**
   * ⚠️ **The sheet is mounted outside every one of these branches, and that is load-bearing.**
   *
   * `useInvalidate` clears a scope by calling `mutate(key, undefined, …)`, so after a filing this
   * hook's `data` is genuinely `undefined` for the length of the refetch. With the sheet rendered
   * inside the table branch, that unmounted it — taking the success state with it, silently
   * dropping the `setFiledAt` that had just been called on a component that no longer existed,
   * and, worse, standing to destroy a form mid-upload. Found in the browser: the multi-outlet
   * success panel never appeared, because the component holding its state had ceased to exist
   * between the 201 and the render.
   *
   * A modal belongs to the page, not to the table it was opened from.
   */
  const body = error ? (
    <QueryError error={error} />
  ) : isLoading || !data ? (
    <LoadingRows rows={4} />
  ) : data.length === 0 ? (
    <EmptyState
      message="No active service schedules"
      hint="Set a cadence on a contract's page — that expectation is what makes a missed visit detectable at all."
    />
  ) : (
    <div className="flex flex-col gap-3">
      {/* The honesty line. It sits above the table rather than under it because it qualifies
          what the table *is*, not how much of it has loaded — the opposite of `LoadMore`'s
          "42 loaded", which is a fact about the fetch. */}
      <p className="px-1 text-helper text-ink-secondary">
        {data.length} {data.length === 1 ? "service" : "services"} on a cadence.
        {withoutCadence === null ? null : withoutCadence === 0 ? (
          " Every active contract has one."
        ) : (
          <>
            {" "}
            {withoutCadence} active {withoutCadence === 1 ? "contract has" : "contracts have"}{" "}
            none recorded, so nothing is expected from{" "}
            {withoutCadence === 1 ? "it" : "them"}.
          </>
        )}
        {/* **The third clause, and it counts a different set from the two before it.** Those
            are about *pairs on a cadence*; this is about *filings already made* whose paper
            never arrived — which can belong to an ad-hoc contract with no row on this page at
            all. Hence its own query (`useAwaitingDocument`), and hence it links away rather
            than narrowing anything here.

            Rendered only when there is something to report: zero awaiting is not a gap, it is
            the normal state, and a permanent "0 awaiting document" is noise on the one line
            whose job is to be read. `undefined` — the request in flight — renders nothing for
            the same reason the clause above it does.

            **A sentence, not the plan's `" · N awaiting document"`**, and the render is why:
            the two clauses before it are full sentences, so a middot appended to one produced
            *"…nothing is expected from them. · 2 awaiting document"* — which reads as a typo on
            the one line in this product whose entire job is to be believed. Same departure
            Stage 5 made on this same sentence, and for the same reason. */}
        {awaiting.count ? (
          <>
            {" "}
            <Link
              href="/service-reports?view=filed&missing_doc=1"
              className="underline decoration-dotted underline-offset-2 hover:text-brand"
            >
              {awaiting.count}
              {awaiting.capped ? "+" : ""} filed{" "}
              {awaiting.count === 1 ? "report is" : "reports are"} still missing{" "}
              {awaiting.count === 1 ? "its" : "their"} document
            </Link>
            .
          </>
        ) : null}
      </p>

      {/* **Below `sm`, one card per pair — not this table with a horizontal scrollbar.**
          Six columns cannot be read on a 390px screen at any width they could be given, and a
          table that scrolls sideways hides the two facts this screen exists to deliver: how
          late the service is, and the button that ends it. This is the first screen in the
          product whose primary user is holding a phone, so it is the first to pay for one.

          Rendered as a **second presentation of the same rows**, switched in CSS rather than by
          `useIsMobile` — a hook would need a client-side measurement before it could decide,
          which is a frame of the wrong layout on the device least able to hide it. The cost is
          both presentations in the DOM; at 55 rows that is cheaper than the flash. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {data.map((health) => (
          <ExpectedCard
            key={`${health.contract_id}:${health.outlet_id}`}
            health={health}
            contract={contractById.get(health.contract_id)}
            outlet={outletById.get(health.outlet_id)}
            onFile={() =>
              setFiling({ contractId: health.contract_id, outletId: health.outlet_id })
            }
          />
        ))}
      </ul>

      <TableCard className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Contract</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead>Last visit</TableHead>
              <TableHead>Next expected</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((health) => {
              const contract = contractById.get(health.contract_id);
              const outlet = outletById.get(health.outlet_id);
              return (
                <TableRow key={`${health.contract_id}:${health.outlet_id}`}>
                  <TableCell className="max-w-[26ch] pl-5">
                    <Link
                      href={`/contracts/${health.contract_id}`}
                      title={contract?.title}
                      className="block truncate font-medium text-ink hover:text-brand hover:underline"
                    >
                      {contract?.title ?? PENDING}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[16ch] text-ink-secondary">
                    {outlet ? (
                      <Link
                        href={`/outlets/${outlet.id}`}
                        title={outlet.name}
                        className="block truncate hover:text-brand hover:underline"
                      >
                        {outlet.name}
                      </Link>
                    ) : (
                      PENDING
                    )}
                  </TableCell>
                  <TableCell className="max-w-[15ch] whitespace-normal text-ink-secondary">
                    {SERVICE_FREQUENCY_LABELS[health.frequency]}
                    {/* Wraps rather than truncates. This line is provenance — *Twice a month
                        (Lark: Bi-monthly)*, written by the backfill so the row says where its
                        cadence came from — and a provenance note with its source clipped off
                        is not provenance. */}
                    {health.expected_day_rule ? (
                      <span className="mt-0.5 block text-helper text-ink-tertiary">
                        {health.expected_day_rule}
                      </span>
                    ) : null}
                  </TableCell>
                  {/* **One treatment, not an em dash plus a sentence explaining it.** The
                      inherited cell rendered `—` and then "No completed visit yet" underneath,
                      which is the same fact twice — and on this data it is *every* row, so
                      every row was two lines tall for a redundancy. "None completed" is the
                      value: precise (a missed or cancelled visit is a row and is not service
                      delivered) and one line at this width. */}
                  <TableCell className="max-w-[14ch] text-ink-secondary">
                    {health.last_completed ? (
                      formatDate(health.last_completed)
                    ) : (
                      <span className="text-ink-tertiary">None completed</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[17ch] whitespace-normal">
                    {health.next_expected ? (
                      <span
                        className={health.overdue ? "text-warning" : "text-ink-secondary"}
                      >
                        {formatDate(health.next_expected)}
                        {/* Ochre **and** words, never colour alone — the rule the expired
                            warranty column set and the dashboard's own badge follows. Under
                            the date rather than beside it: inline, the pair set this column
                            at 300px on behalf of one four-digit row. */}
                        {health.overdue ? (
                          <Badge variant="warning" className="mt-1 flex w-fit">
                            {health.days_overdue} days overdue
                          </Badge>
                        ) : null}
                      </span>
                    ) : (
                      <NoBaseline contractId={health.contract_id} />
                    )}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    {/* The row's own control, and the entry point with the most prefill: both
                        halves of the pair are settled, so the sheet opens straight on the form
                        with no picker at all. Stage 5 shipped this as a link to the contract
                        page; this is the door it was standing in for. */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setFiling({
                          contractId: health.contract_id,
                          outletId: health.outlet_id,
                        })
                      }
                    >
                      File report
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );

  return (
    <>
      {body}
      {/* `open` is derived from the prefill and the prefill is cleared on close — but the sheet
          is **not** keyed on it, because a key that changes mid-dismissal remounts the popup and
          leaves Base UI's overlay eating clicks. The sheet resets its own draft during render. */}
      <FileReportSheet
        open={filing !== null}
        onOpenChange={(open) => !open && setFiling(null)}
        prefill={filing ?? undefined}
      />
    </>
  );
}

/**
 * One expected service, on a phone.
 *
 * **A card is not a narrow table row, and the difference is what the caps were for.** Every
 * `max-w-*ch` in the table above exists to stop one long title setting a *column* — a cost every
 * other row then pays. A card owns its own width, so the title wraps and nothing is truncated:
 * the two Willow contracts that read *"Pest Control — Willow"* and differ only by vendor are the
 * standing proof that clipping here loses the identifying half.
 *
 * The order is the order the reader needs it in: **what**, **where**, **how late**, then the
 * button. The overdue badge leads its line rather than trailing the date, because on this screen
 * lateness is the sort key and a thumb scrolling past should be able to read it without reading
 * the row.
 */
function ExpectedCard({
  health,
  contract,
  outlet,
  onFile,
}: {
  health: ContractHealth;
  contract: ContractRecord | undefined;
  outlet: Outlet | undefined;
  onFile: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-e1">
      <Link
        href={`/contracts/${health.contract_id}`}
        className="text-sm font-medium text-ink hover:text-brand hover:underline"
      >
        {contract?.title ?? PENDING}
      </Link>

      {health.next_expected ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {health.overdue ? (
            <Badge variant="warning">{health.days_overdue} days overdue</Badge>
          ) : null}
          <span className={health.overdue ? "text-helper text-warning" : "text-helper text-ink-secondary"}>
            Due {formatDate(health.next_expected)}
          </span>
        </div>
      ) : (
        <div className="text-helper">
          <NoBaseline contractId={health.contract_id} />
        </div>
      )}

      {/* **The outlet rides in the meta line rather than on a line of its own, and that is a
          measurement rather than a preference.** All 55 titles in this data already end in the
          site — the Lark import composes them as `<trade> — <outlet>` — so a card giving the
          outlet its own line said "Casa Vostra CK" directly under "Wifi / Internet — Casa Vostra
          CK", on **55 of 55 rows**, for 21px each.

          Suppressing the line when the title contains the name was the obvious fix and is the
          wrong one: it is a substring test standing between a reader and *which site this paper
          belongs to*, and an outlet whose name is a prefix of another's would hide the very fact
          that distinguishes them. So nothing is hidden and nothing is guessed — the fact moves to
          where it costs no line, keeping its link, one tap from the card either way. */}
      <p className="text-helper text-ink-tertiary">
        {outlet ? (
          <Link
            href={`/outlets/${outlet.id}`}
            className="text-ink-secondary hover:text-brand hover:underline"
          >
            {outlet.name}
          </Link>
        ) : (
          PENDING
        )}{" "}
        · {SERVICE_FREQUENCY_LABELS[health.frequency]} ·{" "}
        {health.last_completed
          ? `last visit ${formatDate(health.last_completed)}`
          : "none completed"}
        {/* Provenance, on its own line exactly as the table renders it. Twelve of these rows
            were written by the backfill rather than by a person, and a row that cannot say
            where its cadence came from is a row nobody can argue with. */}
        {health.expected_day_rule ? (
          <span className="mt-0.5 block">{health.expected_day_rule}</span>
        ) : null}
      </p>

      {/* `lg` is **44px** — the tap target this stage is here to guarantee, and full-width so it
          is reachable with the thumb that is already on the left or the right of the phone.
          Secondary, not primary: the accent has a per-view budget (`AGENTS.md`), the page's own
          *File report* already spends it, and fifty-five green buttons down a scroll is what
          that budget exists to prevent. */}
      <Button variant="secondary" size="lg" className="w-full" onClick={onFile}>
        File report
      </Button>
    </li>
  );
}

/**
 * A pair on a cadence that nothing can be expected of: no visit ever, and no contract start
 * date to measure the first one from. `detect_overdue` skips these rather than calling them
 * overdue, which is right and is also why they would otherwise sit here saying nothing.
 *
 * **The plan sends this row to `/review?kind=contract_dates_missing`, and that is not a review
 * kind.** `ReviewKind` carries `contract_end_date_missing` — a different fact, about the other
 * end of the term — and there is no detector for a missing *start* date at all. The queue would
 * answer an unknown `kind` with a 422, so the link would take a reader from a row that is
 * visibly incomplete to a page that fails; a link to the nearest real kind would take them to a
 * list that does not contain this contract. Both are worse than the third option, which is to
 * send them to the record that holds the missing field.
 */
function NoBaseline({ contractId }: { contractId: string }) {
  return (
    <span className="text-ink-tertiary">
      No baseline —{" "}
      <Link
        href={`/contracts/${contractId}`}
        className="underline decoration-dotted underline-offset-2 hover:text-brand"
      >
        no visit yet and no start date
      </Link>
    </span>
  );
}
