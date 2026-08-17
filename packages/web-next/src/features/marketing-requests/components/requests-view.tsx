"use client";

import { CheckIcon, CopyIcon, PlusIcon, Share2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { FilterBar, SearchField, SegmentedControl } from "@/components/layout/filter-bar";
import { HighlightMatch } from "@/components/layout/highlight-match";
import { MockBanner } from "@/components/layout/mock-banner";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { TableCard } from "@/components/layout/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { FormSubmission } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

import {
  MARKETING_REQUEST_FORM,
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABELS,
  type SubmissionStatus,
} from "../fixture";
import { useRequestMutations, useRequests } from "../hooks";
import { NewRequestSheet } from "./new-request-sheet";
import { RequestSheet } from "./request-sheet";

/**
 * Marketing Requests — **the inbox is the screen**.
 *
 * This area arrived from the Operations Hub as a form gallery: two cards to pick between, the
 * blank form filling the panel underneath, and the submissions behind a segmented control that
 * started on the other tab. That is the right layout for the person *raising* a request and the
 * wrong one for everybody who uses this product. A marketer opens this page perhaps fifty times
 * to read what has come in for every once they raise something themselves, and the old screen
 * put the rare job in the middle and the constant one one click away.
 *
 * So it is inverted. The queue is the page; the form is a button on it (**New request**), and
 * the public link anyone else fills is a second button beside it. Nothing was removed to do it —
 * the same form, the same share link, the same three-rung ladder — they are just arranged in the
 * order the work actually happens: read, open, answer.
 *
 * **Filters are local `useState`, not the URL**, which is the one place this screen departs from
 * the list-screen rules in AGENTS.md. Those rules exist so a *filtered link is shareable*, and
 * they cost a `<Suspense>` boundary because `useSearchParams` opts the subtree out of static
 * prerendering. Neither side of that trade applies yet: the rows are samples held in memory, so
 * a link to a filtered view of them describes one tab's session and nobody else's. Move the
 * filters into `useQueryFilters` in the same change that gives the rows a backend.
 */
export function MarketingRequestsView() {
  const [status, setStatus] = React.useState<StatusView>("all");
  const [q, setQ] = React.useState<string | undefined>();
  const [newOpen, setNewOpen] = React.useState(false);
  const [reading, setReading] = React.useState<FormSubmission | undefined>();

  const { data, error, isLoading } = useRequests();
  const rows = React.useMemo(() => data ?? [], [data]);

  // Debounced so typing does not re-filter ten rows per keystroke, and because the day this
  // list is a request rather than an array is the day the debounce has to already be here.
  const debouncedQ = useDebouncedValue(q, 200);
  const visible = React.useMemo(
    () => rows.filter((row) => inStatus(row, status) && inSearch(row, debouncedQ)),
    [rows, status, debouncedQ],
  );

  // The counts are the **unfiltered** ladder, on purpose: they are the segmented control's own
  // labels, so a count that narrowed with the search box would tell the reader that four of
  // their requests had stopped being new. Search narrows the table under the control, not the
  // control.
  const counts = React.useMemo(() => tally(rows), [rows]);

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <MockBanner title="Sample requests — held in memory, not stored">
        Ten example requests, so the inbox can be read at a realistic length. Submitting one and
        moving a status both work and neither survives a reload — there is no backend behind this
        screen yet.
      </MockBanner>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterBar
          activeCount={q ? 1 : 0}
          // The status view is not a filter and does not clear with one — the same split every
          // other screen here makes between a view control and a WHERE.
          onClear={() => setQ(undefined)}
        >
          <SearchField
            label="Search requests by summary, outlet or person"
            placeholder="Summary, outlet or who asked"
            value={q}
            onChange={setQ}
          />
          <SegmentedControl<StatusView>
            label="Which requests to show"
            value={status}
            options={[
              { value: "all", label: `All ${rows.length}` },
              ...SUBMISSION_STATUSES.map((key) => ({
                value: key,
                label: `${SUBMISSION_STATUS_LABELS[key]} ${counts[key]}`,
              })),
            ]}
            onChange={setStatus}
          />
        </FilterBar>

        <div className="flex flex-wrap items-center gap-2">
          <ShareLink />
          <Button onClick={() => setNewOpen(true)} className="w-full sm:w-auto">
            <PlusIcon data-icon="inline-start" />
            New request
          </Button>
        </div>
      </div>

      {error ? (
        <QueryError error={error} />
      ) : isLoading ? (
        <LoadingRows rows={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          message={
            rows.length === 0
              ? "Nothing has come in yet"
              : "No requests match this view"
          }
          hint={
            rows.length === 0
              ? "Share the public link and requests land here, or raise one yourself with New request."
              : "Widen the status view, or clear the search."
          }
        />
      ) : (
        <RequestsTable rows={visible} q={debouncedQ} onOpen={setReading} />
      )}

      <NewRequestSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        onSubmitted={(created) => {
          setNewOpen(false);
          // Land the reader on the thing they just made, rather than on a table where it is one
          // row among ten and possibly filtered out of view — `status` may be "Completed".
          setReading(created);
        }}
      />
      <RequestSheet
        submission={reading}
        open={reading !== undefined}
        onOpenChange={(open) => {
          if (!open) setReading(undefined);
        }}
      />
    </div>
  );
}

/** "all" is the absence of a status filter, not a fourth status. */
type StatusView = SubmissionStatus | "all";

function inStatus(row: FormSubmission, view: StatusView): boolean {
  return view === "all" || row.status === view;
}

/**
 * What the search box promises, and no more. The placeholder names three fields and this tests
 * exactly those three — a box that quietly also matched the details body would find rows whose
 * reason for matching is nowhere on the table, and the highlight below could not mark them.
 */
function inSearch(row: FormSubmission, q: string | undefined): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [row.summary, row.outlet_label, row.submitter].some((field) =>
    (field ?? "").toLowerCase().includes(needle),
  );
}

function tally(rows: FormSubmission[]): Record<SubmissionStatus, number> {
  const counts: Record<SubmissionStatus, number> = { new: 0, in_review: 0, resolved: 0 };
  for (const row of rows) counts[row.status as SubmissionStatus] += 1;
  return counts;
}

/**
 * The queue.
 *
 * **The row opens the request and the status cell does not.** A `<select>` inside a clickable
 * row is the classic double-action bug — press it to triage and a sheet opens over the menu —
 * so the cell stops the click before it reaches the row. The row itself is a `<button>` in the
 * first cell rather than an `onClick` on the `<tr>`: a table row is not focusable and not
 * announced as actionable, and "click the row" is unusable without a mouse.
 */
function RequestsTable({
  rows,
  q,
  onOpen,
}: {
  rows: FormSubmission[];
  q: string | undefined;
  onOpen: (submission: FormSubmission) => void;
}) {
  const { setStatus } = useRequestMutations();

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Ref</TableHead>
            <TableHead>Request</TableHead>
            <TableHead>Outlet</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Needed by</TableHead>
            <TableHead className="pr-5">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="pl-5 font-mono text-helper font-medium text-ink">
                {row.reference}
              </TableCell>
              <TableCell className="max-w-[36ch]">
                <button
                  type="button"
                  onClick={() => onOpen(row)}
                  className="block w-full text-left"
                >
                  <span className="block truncate font-medium text-ink" title={row.summary}>
                    <HighlightMatch text={row.summary} query={q} />
                  </span>
                  <span className="block truncate text-helper text-ink-tertiary">
                    <HighlightMatch text={row.submitter ?? "Unattributed"} query={q} /> ·{" "}
                    {formatDate(row.created_at.slice(0, 10))}
                  </span>
                </button>
              </TableCell>
              <TableCell className="max-w-[24ch] text-ink-secondary">
                <span className="block truncate">
                  <HighlightMatch text={row.outlet_label ?? "—"} query={q} />
                </span>
              </TableCell>
              <TableCell className="text-ink-secondary">{answer(row, "Request type")}</TableCell>
              <TableCell>
                <PriorityBadge value={answer(row, "Priority")} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-ink-secondary">
                {formatDate(answer(row, "Needed by"))}
              </TableCell>
              {/* The stop is on the cell, not the control: the padding around a select is part
                  of the same target as far as a pointer is concerned. */}
              <TableCell className="pr-5" onClick={(event) => event.stopPropagation()}>
                <Select
                  containerClassName="w-36"
                  aria-label={`Status of ${row.reference}`}
                  value={row.status}
                  onChange={(event) =>
                    void setStatus(row.id, event.target.value as SubmissionStatus)
                  }
                >
                  {SUBMISSION_STATUSES.map((key) => (
                    <option key={key} value={key}>
                      {SUBMISSION_STATUS_LABELS[key]}
                    </option>
                  ))}
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}

/**
 * One answer out of the free-form payload, by the label the form asked it under.
 *
 * The payload is `{label: value}` because there is no form builder and no per-field column — so
 * a column reading "Request type" is reading the question, not a schema. Renaming a field in
 * `fixture.ts` therefore empties a column, which is why the labels are quoted here rather than
 * hidden behind a constant that would look safe.
 */
function answer(row: FormSubmission, label: string): string | undefined {
  const value = row.payload[label];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Priority as a pill, and **only Urgent is coloured**.
 *
 * Four tones over four rungs turns the column into a traffic light and the eye stops reading
 * any of it; one marked value is a column you can scan. Urgent takes `warning` rather than
 * `error` — a request is not a failure — and Low/Medium/High stay neutral outlines. The word is
 * always present, so the colour is never the only carrier (WCAG 1.4.1).
 */
function PriorityBadge({ value }: { value: string | undefined }) {
  if (!value) return <span className="text-ink-tertiary">—</span>;
  return (
    <Badge variant={value === "Urgent" ? "warning" : "outline"} className="whitespace-nowrap">
      {value}
    </Badge>
  );
}

/**
 * The public form's address, behind a button.
 *
 * A `Popover` and not a `DropdownMenu`: a menu promises `menuitem` children with roving
 * arrow-key focus, and this is a read-only text field and a copy button. It was an always-open
 * panel above the form on the old screen, where it explained the surface it sat on; on an inbox
 * it is a thing you fetch once a quarter and it takes a button.
 */
function ShareLink() {
  const [copied, setCopied] = React.useState(false);
  // `window` is read in render, which is safe here only because the panel's content renders
  // after a click. Under SSR this component returns the trigger and nothing else.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/f/${MARKETING_REQUEST_FORM.slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="secondary" className="w-full sm:w-auto">
            <Share2Icon data-icon="inline-start" />
            Share link
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96">
        <div className="flex flex-col gap-3">
          <p className="text-helper text-ink-secondary">
            Anyone with this link can raise a request without logging in. Their answers arrive in
            this inbox.
          </p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={url}
              aria-label="Public request form link"
              className="font-mono text-helper"
            />
            <Button variant="secondary" size="sm" onClick={copy} className="shrink-0">
              {copied ? (
                <>
                  <CheckIcon data-icon="inline-start" />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon data-icon="inline-start" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
