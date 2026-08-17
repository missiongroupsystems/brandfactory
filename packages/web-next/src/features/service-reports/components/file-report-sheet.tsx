"use client";

import { ChevronRightIcon, Loader2Icon, PaperclipIcon, XIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useContractIndex, useServiceHealth } from "@/features/contracts/hooks";
import { useOutletIndex } from "@/features/registry/hooks";
import { useVendorIndex } from "@/features/vendors/hooks";
import { toNullable, useSubmit } from "@/hooks/use-submit";
import type { ContractHealth, Outlet } from "@/lib/api/types";
import type { ContractRecord } from "@/features/contracts/api";
import { formatDate } from "@/lib/format";
import { SERVICE_CATEGORY_ICONS, SERVICE_CATEGORY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { useFileReport } from "../hooks";

/** Above this many rows the contract list gets a search box. Two of 23 outlets are over it. */
const SEARCH_THRESHOLD = 8;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * What the sheet is opened knowing. Every field is optional and the four entry points differ
 * only in how many they supply:
 *
 * - the page's primary action — nothing, so the picker runs from the top;
 * - an Expected row — contract **and** outlet, so the picker is skipped entirely;
 * - `VisitsCard` — the contract, so only the outlet is left to choose (and one of 147 contracts
 *   covers exactly one outlet, so usually nothing is);
 * - `OutletServiceCard` — the outlet, so the list is that site's contracts.
 */
export type FileReportPrefill = {
  contractId?: string;
  outletId?: string;
  /**
   * File against an attendance already on the books. `VisitsCard`'s per-row *Report* passes it,
   * which is what keeps that button's behaviour exactly what it was — and is why that card no
   * longer carries a second report form of its own.
   */
  visitId?: string;
  /**
   * Overrides today's default. Only `visitId`'s caller supplies it: a report attached to a visit
   * recorded three weeks ago is dated by the visit, not by the day somebody got round to filing.
   */
  reportDate?: string;
};

/**
 * **File report** — one component, four entry points, and the only door this product has to the
 * paper a technician leaves behind.
 *
 * The draft resets **during render** when `open` flips true, never through a `key` on
 * `SheetContent`. A sheet's content survives its close (it stays mounted through the exit
 * animation), so a form reopened straight after a successful filing would still hold the previous
 * draft — and keying the content on state that clears on close remounts the popup mid-dismissal
 * and wedges Base UI's overlay, which is the trap `AGENTS.md` names this very form for.
 *
 * **Nothing is optimistic and the sheet does not close on the 201.** The report row exists after
 * one call; the document is a second round trip to object storage. Closing in between would put a
 * "Filed" toast over a document that never arrived.
 */
export function FileReportSheet({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: FileReportPrefill;
}) {
  const fileReport = useFileReport();
  const { run, reset, isPending, formError, fieldErrors } = useSubmit();
  const { contracts, byId: contractById } = useContractIndex();
  const { outlets, byId: outletById } = useOutletIndex();
  const { byId: vendorById } = useVendorIndex();
  const { data: health } = useServiceHealth();

  const [outletId, setOutletId] = React.useState(prefill?.outletId ?? "");
  const [contractId, setContractId] = React.useState(prefill?.contractId ?? "");
  /**
   * **State, not read straight off `prefill` — and the difference is a dead end.**
   *
   * A visit belongs to exactly one (contract, outlet) pair and `file_report` refuses one that
   * does not match the payload, by design. Read directly from the prefill, the id survived the
   * *file at another outlet* step below: `VisitsCard` opens this sheet with a `visitId`, so on a
   * multi-outlet contract the success panel offered the remaining sites and every one of them
   * submitted the first outlet's visit against a second outlet — a guaranteed 409, phrased for
   * an API caller, on a form the reader did not fill in. Holding it here lets `onAnother` clear
   * it, which is the correct filing anyway: a second site is a second attendance and gets its
   * own visit.
   */
  const [visitId, setVisitId] = React.useState(prefill?.visitId ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [showDetails, setShowDetails] = React.useState(false);
  const [filedAt, setFiledAt] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(() => emptyForm(prefill?.reportDate));
  const fileInput = React.useRef<HTMLInputElement>(null);

  // Reset per open, during render. See the component docstring — this is the documented
  // adjust-state-on-prop-change pattern, and it is not the effect that broke this build once.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOutletId(prefill?.outletId ?? "");
      setContractId(prefill?.contractId ?? "");
      setVisitId(prefill?.visitId ?? "");
      setFile(null);
      setShowDetails(false);
      setFiledAt(null);
      setForm(emptyForm(prefill?.reportDate));
    }
  }

  const contract = contractId ? contractById.get(contractId) : undefined;

  // 147 of 158 contracts cover exactly one outlet, so this is normally settled without a control.
  const coverage = contract?.outlet_ids ?? [];
  const settledOutletId =
    outletId || (coverage.length === 1 ? coverage[0] : "") || prefill?.outletId || "";

  /**
   * Move the filing to another outlet, taking the visit with it only where it is still valid.
   *
   * A `service_visit` belongs to exactly one (contract, outlet) pair and `file_report` answers a
   * mismatch with a 409 — correctly, since the alternative is a report hanging off an attendance
   * at a different site. Every control that can move the outlet therefore goes through here: the
   * coverage select, and the *file at another outlet* panel. The prefilled visit is not
   * discarded, only set aside — coming back to the outlet it belongs to makes it valid again,
   * so a reader who mis-clicks the select does not silently get a duplicate visit.
   */
  const chooseOutlet = (id: string) => {
    setOutletId(id);
    setVisitId(id === prefill?.outletId ? (prefill?.visitId ?? "") : "");
  };

  const set = <K extends keyof ReturnType<typeof emptyForm>>(
    key: K,
    value: ReturnType<typeof emptyForm>[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!contract || !settledOutletId) return;

    const ok = await run(async () => {
      await fileReport(
        {
          contract_id: contract.id,
          outlet_id: settledOutletId,
          report_date: form.report_date,
          visit_id: visitId || null,
          technician_name: toNullable(form.technician_name),
          findings: toNullable(form.findings),
          issues_raised: toNullable(form.issues_raised),
          follow_up_required: form.follow_up_required,
          follow_up_due: form.follow_up_required ? toNullable(form.follow_up_due) : null,
        },
        file,
      );

      // **The service-health consequence, not the dashboard one.** `/service-health` is computed
      // live, so the row leaves Expected on this response; the dashboard's `expected_visit` rows
      // are `obligation` records that only move when `generate_all` runs, and nothing schedules
      // it. Promising the dashboard here would be a promise this product cannot keep today.
      const where = outletById.get(settledOutletId)?.name;
      toast.success(
        wasOverdue(health, contract.id, settledOutletId)
          ? `Report filed. ${contract.title}${where ? ` at ${where}` : ""} is no longer overdue.`
          : `Report filed for ${contract.title}${where ? ` at ${where}` : ""}.`,
      );
    });

    if (!ok) return;
    // A contract covering one outlet has nothing left to offer, so the sheet closes. One covering
    // several is the case where the same paper often covers a second site.
    if (coverage.length > 1) setFiledAt(settledOutletId);
    else onOpenChange(false);
  }

  const picking = !contract;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      {/* No `key` on the content — see the docstring. */}
      <SheetContent>
        <SheetHeader>
          <SheetTitle>File report</SheetTitle>
          <SheetDescription>
            {filedAt
              ? "Filed. The same paper often covers a second site."
              : picking
                ? "Pick the service this report is for. Overdue ones first."
                : "One filing records the visit and the report together."}
          </SheetDescription>
        </SheetHeader>

        {filedAt ? (
          <FiledAgainPanel
            contract={contract!}
            outletById={outletById}
            filedAt={filedAt}
            onAnother={(nextOutletId) => {
              // The visit does not travel with it, for the same reason the document does not:
              // it is one attendance at one site. Carrying it produced a 409 the reader could
              // do nothing about; `chooseOutlet` records the second site's own visit instead,
              // which is what filing there means.
              chooseOutlet(nextOutletId);
              setFile(null);
              setFiledAt(null);
            }}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <form onSubmit={handleSubmit} className="contents">
            <SheetBody className="flex flex-col gap-5">
              {formError ? (
                <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
                  {formError}
                </p>
              ) : null}

              {picking ? (
                <ServicePicker
                  contracts={contracts}
                  outlets={outlets}
                  health={health}
                  vendorNameFor={(id) => vendorById.get(id)?.name}
                  outletId={outletId}
                  onOutletChange={setOutletId}
                  onPick={(picked, atOutlet) => {
                    setContractId(picked);
                    setOutletId(atOutlet);
                  }}
                />
              ) : (
                <>
                  <ChosenService
                    contract={contract}
                    vendorName={vendorById.get(contract.vendor_id)?.name}
                    // Only offered when the picker was how we got here. An Expected row or a
                    // contract page has settled the service already, and a Change button there
                    // would invite someone to file against a different contract than the one
                    // they opened.
                    onChange={
                      prefill?.contractId
                        ? undefined
                        : () => {
                            setContractId("");
                            // Unreachable with a visit today — this button is offered only when
                            // the contract was *not* prefilled, and `visitId` only ever arrives
                            // alongside one. Kept so the invariant holds locally rather than by
                            // an argument about which of the four callers supplies what.
                            setVisitId("");
                            setFile(null);
                          }
                    }
                  />

                  {/* Hidden when the contract covers exactly one outlet — 147 of 158. The select
                      is also **a stand-in for identity**: `user_outlet` and `outlet_scope` exist
                      on the backend, and when Mission auth lands this narrows to one value for
                      most people and disappears. */}
                  {coverage.length > 1 ? (
                    <Field label="Outlet" required error={fieldErrors.outlet_id}>
                      {(field) => (
                        <Select
                          {...field}
                          required
                          value={settledOutletId}
                          onChange={(event) => chooseOutlet(event.target.value)}
                        >
                          <option value="">Which site was serviced?</option>
                          {coverage.map((id) => (
                            <option key={id} value={id}>
                              {outletById.get(id)?.name ?? id}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  ) : null}

                  <Field
                    label="Date of service"
                    required
                    hint="When the technician was here, not when the paper was filed."
                    error={fieldErrors.report_date}
                  >
                    {(field) => (
                      <Input
                        {...field}
                        type="date"
                        required
                        value={form.report_date}
                        onChange={(event) => set("report_date", event.target.value)}
                      />
                    )}
                  </Field>

                  <FilePicker
                    file={file}
                    inputRef={fileInput}
                    onPick={setFile}
                    disabled={isPending}
                  />

                  {/* A disclosure, not five more fields on screen. Half of these arrive as a
                      photograph of a paper form on a phone, and everything under here is already
                      written on the paper. */}
                  <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit"
                      aria-expanded={showDetails}
                      onClick={() => setShowDetails((current) => !current)}
                    >
                      <ChevronRightIcon
                        data-icon="inline-start"
                        className={cn(
                          "transition-transform duration-[120ms]",
                          showDetails && "rotate-90",
                        )}
                      />
                      Add details
                    </Button>

                    {showDetails ? (
                      <>
                        <Field label="Technician" error={fieldErrors.technician_name}>
                          {(field) => (
                            <Input
                              {...field}
                              maxLength={200}
                              value={form.technician_name}
                              onChange={(event) => set("technician_name", event.target.value)}
                            />
                          )}
                        </Field>
                        <FieldGrid>
                          <Field label="Findings" error={fieldErrors.findings}>
                            {(field) => (
                              <Textarea
                                {...field}
                                value={form.findings}
                                onChange={(event) => set("findings", event.target.value)}
                                placeholder="What was done."
                              />
                            )}
                          </Field>
                          <Field label="Issues raised" error={fieldErrors.issues_raised}>
                            {(field) => (
                              <Textarea
                                {...field}
                                value={form.issues_raised}
                                onChange={(event) => set("issues_raised", event.target.value)}
                                placeholder="What still needs doing."
                              />
                            )}
                          </Field>
                        </FieldGrid>
                      </>
                    ) : null}
                  </div>

                  {/* The invalid combination is unenterable rather than refused: clearing the
                      box clears the date, and the date only exists while the box is ticked. The
                      backend carries the same rule as a payload validator — this is so nobody
                      meets it. */}
                  <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <Checkbox
                        checked={form.follow_up_required}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            follow_up_required: event.target.checked,
                            follow_up_due: event.target.checked ? current.follow_up_due : "",
                          }))
                        }
                      />
                      Follow-up required
                    </label>

                    {form.follow_up_required ? (
                      <Field
                        label="Follow-up due"
                        hint="Without a date, nothing will chase this."
                        error={fieldErrors.follow_up_due}
                      >
                        {(field) => (
                          <Input
                            {...field}
                            type="date"
                            value={form.follow_up_due}
                            onChange={(event) => set("follow_up_due", event.target.value)}
                          />
                        )}
                      </Field>
                    ) : null}
                  </div>
                </>
              )}
            </SheetBody>

            <SheetFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
              {/* **The button names the outcome.** With a file it is the primary action and says
                  what happened; without one it is secondary, says what *did not*, and carries the
                  consequence underneath. Nobody reaches the weaker outcome by accident, and
                  nobody is blocked by it — a technician who left no paper is a real Tuesday. */}
              {!picking && !file ? (
                <p className="text-helper text-ink-tertiary">
                  Ops will be asked to chase the document.
                </p>
              ) : null}
              {/* **Stacked below `sm`, exactly as `SheetFooter`'s own default does it.** This
                  row overrode that default into `justify-end` and then measured 276px inside the
                  252px a 390px phone left it — *Record without document* is the longest submit
                  label in the product and it is the one this screen shows most. `flex-col-reverse`
                  keeps the DOM order (Cancel first, so it is the tab-order escape) while putting
                  the submit above it, which is the order every other sheet already uses. */}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={file ? "default" : "secondary"}
                  disabled={isPending || picking || !settledOutletId}
                >
                  {isPending ? (
                    <>
                      <Loader2Icon className="animate-spin" data-icon="inline-start" />
                      {file ? "Filing" : "Recording"}
                    </>
                  ) : file ? (
                    "File report"
                  ) : (
                    "Record without document"
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function emptyForm(reportDate?: string) {
  return {
    // Today, because the overwhelmingly common case is somebody filing what they are holding —
    // unless the caller is filing against a visit that already has a date of its own.
    report_date: reportDate ?? today(),
    technician_name: "",
    findings: "",
    issues_raised: "",
    follow_up_required: false,
    follow_up_due: "",
  };
}

/** Whether this pair is currently owed a visit — what makes the toast's stronger sentence true. */
function wasOverdue(
  health: ContractHealth[] | undefined,
  contractId: string,
  outletId: string,
): boolean {
  return Boolean(
    health?.some(
      (row) => row.contract_id === contractId && row.outlet_id === outletId && row.overdue,
    ),
  );
}

/**
 * Step 1 the outlet, step 2 **a list of rows, not a select**.
 *
 * A select is the wrong control here for a reason that is about the data rather than about taste:
 * an option can carry one line of text, and what tells these apart is four facts — the trade, the
 * title, who the vendor is, and how late they are. *"Grease Trap Maintenance — Willow"* twice over
 * with different vendors is a real pair in this database.
 *
 * Most-overdue first and the ad-hoc contracts below them, because the reason somebody opened this
 * sheet is usually sitting at the top of that order. The same row-list shape the brands picker
 * already is — no new primitive.
 */
function ServicePicker({
  contracts,
  outlets,
  health,
  vendorNameFor,
  outletId,
  onOutletChange,
  onPick,
}: {
  contracts: ContractRecord[];
  outlets: Outlet[];
  health: ContractHealth[] | undefined;
  vendorNameFor: (vendorId: string) => string | undefined;
  outletId: string;
  onOutletChange: (id: string) => void;
  onPick: (contractId: string, outletId: string) => void;
}) {
  const [q, setQ] = React.useState("");

  const rows = React.useMemo(() => {
    if (!outletId) return [];
    const byPair = new Map(
      (health ?? []).map((row) => [`${row.contract_id}:${row.outlet_id}`, row]),
    );
    return contracts
      .filter(
        (contract) =>
          contract.status === "active" && contract.outlet_ids.includes(outletId),
      )
      .map((contract) => ({
        contract,
        pair: byPair.get(`${contract.id}:${outletId}`),
      }))
      .sort((a, b) => {
        // Overdue first by how late, then everything with a cadence, then the ad-hoc tail.
        const rank = (row: (typeof a)["pair"]) =>
          row?.overdue ? 0 : row ? 1 : 2;
        if (rank(a.pair) !== rank(b.pair)) return rank(a.pair) - rank(b.pair);
        if (a.pair?.overdue && b.pair?.overdue) {
          return b.pair.days_overdue - a.pair.days_overdue;
        }
        return a.contract.title.localeCompare(b.contract.title);
      });
  }, [contracts, health, outletId]);

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => row.contract.title.toLowerCase().includes(term));
  }, [rows, q]);

  return (
    <>
      <Field label="Outlet" required>
        {(field) => (
          <Select
            {...field}
            required
            value={outletId}
            onChange={(event) => onOutletChange(event.target.value)}
          >
            <option value="">Where was the service?</option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {!outletId ? (
        <p className="text-helper text-ink-tertiary">
          Choose the site and its live contracts appear here.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-helper text-ink-tertiary">
          No active contracts cover this outlet. A report needs a contract to hang off — add the
          outlet to one from the contract&rsquo;s page first.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Only above eight rows. A search box over five options is a control that costs a
              tap and saves none. Two of 23 outlets are over the line. */}
          {rows.length > SEARCH_THRESHOLD ? (
            <Input
              type="search"
              aria-label="Search this outlet's contracts"
              placeholder="Contract title"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          ) : null}

          <ul className="flex flex-col gap-1">
            {filtered.map(({ contract, pair }) => {
              const Icon = SERVICE_CATEGORY_ICONS[contract.category];
              return (
                <li key={contract.id}>
                  <button
                    type="button"
                    onClick={() => onPick(contract.id, outletId)}
                    // 44px minimum — this is the one screen in the product whose primary user is
                    // holding a phone, and Stage 7 measures it at 390.
                    className="flex min-h-11 w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-sunken"
                  >
                    <Icon
                      aria-label={SERVICE_CATEGORY_LABELS[contract.category]}
                      className="mt-0.5 size-4 shrink-0 text-ink-tertiary"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-ink">
                        {contract.title}
                      </span>
                      {/* Wraps where the title truncates, and the split is deliberate. Two rows
                          in this list read *"Pest Control — Willow"* and differ only by vendor —
                          Electron Exchange and LBS Hygiene, both real, both live — so the vendor
                          is the identifying half and must never be clipped. The title is long,
                          repetitive and already narrowed by the glyph in front of it. */}
                      <span className="text-helper text-ink-tertiary">
                        {vendorNameFor(contract.vendor_id) ?? "…"}
                        {pair?.next_expected ? ` · due ${formatDate(pair.next_expected)}` : ""}
                      </span>
                    </span>
                    {pair?.overdue ? (
                      <Badge variant="warning" className="mt-0.5 shrink-0">
                        {pair.days_overdue} days overdue
                      </Badge>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

/** The settled service, read-only, with the trade in front of it exactly as the tables render it. */
function ChosenService({
  contract,
  vendorName,
  onChange,
}: {
  contract: ContractRecord;
  vendorName: string | undefined;
  onChange?: () => void;
}) {
  const Icon = SERVICE_CATEGORY_ICONS[contract.category];
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-sunken p-3">
      <Icon
        aria-label={SERVICE_CATEGORY_LABELS[contract.category]}
        className="mt-0.5 size-4 shrink-0 text-ink-tertiary"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-ink">{contract.title}</span>
        <span className="text-helper text-ink-tertiary">{vendorName ?? "…"}</span>
      </span>
      {onChange ? (
        <Button type="button" variant="ghost" size="xs" onClick={onChange}>
          Change
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The file, and the camera.
 *
 * `capture="environment"` asks a phone for the rear camera rather than the gallery, because
 * **half these artifacts are paper** — a form on a clipboard, photographed where it was signed.
 * Desktop browsers ignore the attribute entirely, so it costs nothing there.
 */
function FilePicker({
  file,
  inputRef,
  onPick,
  disabled,
}: {
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-helper font-medium text-ink-secondary">Document</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="sr-only"
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2">
          <PaperclipIcon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
          <span className="min-w-0 flex-1 truncate text-helper text-ink">{file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            onClick={() => {
              onPick(null);
              // The input keeps its value after a clear, so re-picking the *same* file would
              // fire no change event and the row would stay empty.
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            <XIcon />
            <span className="sr-only">Remove {file.name}</span>
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="w-fit"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <PaperclipIcon data-icon="inline-start" />
          Photograph or attach
        </Button>
      )}
    </div>
  );
}

/**
 * Filed, on a contract that covers more than one site.
 *
 * One shared pest-control contract really does get serviced at four outlets on one round, and the
 * technician leaves one report at each. Closing the sheet would make the second filing a full
 * journey from the top; this offers the outlets that are left.
 */
function FiledAgainPanel({
  contract,
  outletById,
  filedAt,
  onAnother,
  onDone,
}: {
  contract: ContractRecord;
  outletById: Map<string, Outlet>;
  filedAt: string;
  onAnother: (outletId: string) => void;
  onDone: () => void;
}) {
  const remaining = contract.outlet_ids.filter((id) => id !== filedAt);

  return (
    <>
      <SheetBody className="flex flex-col gap-4">
        <p className="text-sm text-ink">
          Filed for {contract.title} at {outletById.get(filedAt)?.name ?? "this outlet"}.
        </p>
        {remaining.length > 0 ? (
          <>
            <p className="text-helper text-ink-secondary">
              File the same report at another outlet:
            </p>
            <ul className="flex flex-col gap-1">
              {remaining.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onAnother(id)}
                    className="flex min-h-11 w-full items-center rounded-lg px-2 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
                  >
                    {outletById.get(id)?.name ?? id}
                  </button>
                </li>
              ))}
            </ul>
            {/* The document does not travel with it. A signed report names one site, and
                re-uploading the same file against a second report is a claim nobody made. */}
            <p className="text-helper text-ink-tertiary">
              The details carry over; the document does not — each site&rsquo;s report needs its
              own.
            </p>
          </>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </SheetFooter>
    </>
  );
}
