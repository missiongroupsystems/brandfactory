"use client";

import { Loader2Icon } from "lucide-react";
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
import { SegmentedControl } from "@/components/layout/filter-bar";
import { Select } from "@/components/ui/select";
import { useVendorIndex } from "@/features/vendors/hooks";
import { useSubmit } from "@/hooks/use-submit";
import type {
  Contract,
  ContractDisposition,
  ContractDispositionAction,
  ContractSensitive,
  Entity,
  EntityCloseBody,
  EntityOutletAction,
  EntityOutletDisposition,
  Outlet,
} from "@/lib/api/types";

import {
  useEntityIndex,
  useEntityMutations,
  useOutletIndex,
  useOutletMutations,
  useOutletRelatedContracts,
} from "../hooks";

/**
 * The disposition pop-ups for retiring an outlet or entity (Cluster D,
 * `docs/plans/contract-retire.md`).
 *
 * Closing a location is not a silent status flip: every still-open contract covering it needs a
 * decision — **Cease** (archive), **Re-assign** (move coverage to another outlet) or **Hold**
 * (orphan, keep it for later at possibly-zero coverage). The entity flow is two levels: per
 * outlet, **Transfer** to another entity or **Close** (which reveals that outlet's contract
 * dispositions). Nothing is optimistic — the API applies it in one transaction and the dialog
 * closes only once the server answers.
 *
 * **The contract half of this is inert, and says so honestly.** A contract in this product is
 * held for a *brand* and names no outlet, so `/outlets/{id}/related-contracts` is gone and the
 * list below is always empty — which renders as "No contracts cover this outlet", a true
 * statement rather than a broken screen. The machinery stays because it is typed against a wire
 * contract that still declares it and because the outlet-close flow is Operations Hub residue
 * either way; deleting it is a decision about `features/registry`, not about contracts.
 */

type ContractLike = Contract | ContractSensitive;

const ACTION_OPTIONS = [
  { value: "cease" as const, label: "Cease" },
  { value: "reassign" as const, label: "Re-assign" },
  { value: "orphan" as const, label: "Hold" },
];

type RowState = { action: ContractDispositionAction; toOutletId: string };
type DispositionMap = Record<string, RowState>;

/** Every contract starts on the safe default — Cease (Decisions §4). */
function initialMap(contracts: ContractLike[]): DispositionMap {
  const map: DispositionMap = {};
  for (const contract of contracts) map[contract.id] = { action: "cease", toOutletId: "" };
  return map;
}

/** Fold a row map into the wire shape. Untouched rows are Cease either way. */
function toDispositions(map: DispositionMap): ContractDisposition[] {
  return Object.entries(map).map(([contract_id, row]) =>
    row.action === "reassign"
      ? { contract_id, action: "reassign", to_outlet_id: row.toOutletId }
      : { contract_id, action: row.action },
  );
}

/** A re-assign with no chosen target is not yet a valid decision. */
function hasUnsetReassign(map: DispositionMap): boolean {
  return Object.values(map).some((row) => row.action === "reassign" && !row.toOutletId);
}

function summarise(map: DispositionMap): string {
  const counts = { cease: 0, reassign: 0, orphan: 0 };
  for (const row of Object.values(map)) counts[row.action] += 1;
  const parts: string[] = [];
  if (counts.cease) parts.push(`${counts.cease} ceased`);
  if (counts.reassign) parts.push(`${counts.reassign} re-assigned`);
  if (counts.orphan) parts.push(`${counts.orphan} held`);
  return parts.join(", ");
}

/**
 * The scrollable per-contract list, shared by the outlet dialog and each closing outlet inside
 * the entity dialog. Controlled: the parent owns the map so it can build the payload.
 */
function ContractDispositionFields({
  contracts,
  closingOutletId,
  value,
  onChange,
}: {
  contracts: ContractLike[];
  /** The outlet being closed — excluded from re-assign targets and named in the warning. */
  closingOutletId: string;
  value: DispositionMap;
  onChange: (next: DispositionMap) => void;
}) {
  const { byId: vendorById } = useVendorIndex();
  const { outlets } = useOutletIndex();

  // Re-assign targets: every open outlet except the one being closed. A closed site is not
  // somewhere to move live cover to.
  const targets = React.useMemo(
    () => outlets.filter((o) => o.id !== closingOutletId && o.status !== "closed"),
    [outlets, closingOutletId],
  );

  const [bulkTarget, setBulkTarget] = React.useState("");

  function setRow(contractId: string, patch: Partial<RowState>) {
    onChange({ ...value, [contractId]: { ...value[contractId], ...patch } });
  }

  function applyToAll(action: ContractDispositionAction) {
    const next: DispositionMap = {};
    for (const id of Object.keys(value)) {
      next[id] = {
        action,
        toOutletId: action === "reassign" ? bulkTarget : "",
      };
    }
    onChange(next);
  }

  function applyBulkTarget(outletId: string) {
    setBulkTarget(outletId);
    const next: DispositionMap = {};
    for (const [id, row] of Object.entries(value)) {
      next[id] = row.action === "reassign" ? { action: "reassign", toOutletId: outletId } : row;
    }
    onChange(next);
  }

  const bulkReassigning = Object.values(value).every((row) => row.action === "reassign");

  return (
    <div className="flex flex-col gap-3">
      {/* Apply to all — the bulk case, so "cease all" / "these three re-assign to X" is one act. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2">
        <span className="text-helper text-ink-secondary">Apply to all</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => applyToAll("cease")}>
            Cease all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => applyToAll("reassign")}
          >
            Re-assign all
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => applyToAll("orphan")}>
            Hold all
          </Button>
          {bulkReassigning ? (
            <Select
              containerClassName="w-48"
              aria-label="Re-assign all to"
              value={bulkTarget}
              onChange={(event) => applyBulkTarget(event.target.value)}
            >
              <option value="">Re-assign all to…</option>
              {targets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>

      <ul className="flex max-h-[22rem] flex-col gap-2 overflow-y-auto">
        {contracts.map((contract) => {
          const row = value[contract.id] ?? { action: "cease", toOutletId: "" };
          const vendor = vendorById.get(contract.vendor_id);

          return (
            <li
              key={contract.id}
              className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-ink">{contract.title}</span>
                <span className="text-helper text-ink-secondary">
                  {/* A name absent from the index is a request in flight, never a missing fact. */}
                  {vendor ? vendor.name : "…"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl<ContractDispositionAction>
                  label={`What to do with ${contract.title}`}
                  value={row.action}
                  options={ACTION_OPTIONS}
                  onChange={(action) =>
                    setRow(contract.id, {
                      action,
                      toOutletId: action === "reassign" ? row.toOutletId : "",
                    })
                  }
                />

                {row.action === "reassign" ? (
                  <Select
                    containerClassName="w-48"
                    aria-label={`Re-assign ${contract.title} to`}
                    value={row.toOutletId}
                    onChange={(event) => setRow(contract.id, { toOutletId: event.target.value })}
                  >
                    <option value="">Choose an outlet…</option>
                    {targets.map((outlet) => (
                      <option key={outlet.id} value={outlet.id}>
                        {outlet.name}
                      </option>
                    ))}
                  </Select>
                ) : null}
              </div>

              {/* The multi-outlet in-flow ask (Decisions §2) stood here: ceasing a contract that
                  still covered live outlets ended the whole contract, so it named what else went
                  with it. There is no "what else" to name now — a contract covers no outlets —
                  and a warning that could only ever be silent is worse than none. */}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Outlet close ─────────────────────────────────────────────────────────────────────────

/**
 * The outlet-close pop-up. Opened by the outlet form in place of a status→closed PATCH when the
 * outlet has related open contracts. `contracts` is passed in (the form already fetched them to
 * decide whether to open this at all), so this does not refetch.
 */
export function OutletCloseDialog({
  outlet,
  contracts,
  open,
  onOpenChange,
  onClosed,
}: {
  outlet: Outlet;
  contracts: ContractLike[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful close, so the edit form behind this can close too. */
  onClosed?: () => void;
}) {
  const { close } = useOutletMutations();
  const { run, reset, isPending, formError } = useSubmit();

  const [map, setMap] = React.useState<DispositionMap>(() => initialMap(contracts));

  // Reseed when the dialog opens for a fresh outlet — render-time, not an effect (AGENTS.md).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setMap(initialMap(contracts));
  }

  async function handleConfirm() {
    const ok = await run(async () => {
      await close(outlet.id, { dispositions: toDispositions(map) });
      toast.success(`${outlet.name} closed — ${summarise(map)}`);
    });
    if (ok) {
      onOpenChange(false);
      onClosed?.();
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="sm:max-w-2xl">
        <div className="flex flex-col gap-1.5">
          <AlertDialogTitle>Close {outlet.name}</AlertDialogTitle>
          <AlertDialogDescription>
            {contracts.length === 1
              ? "One contract covers this outlet. Decide what happens to it."
              : `${contracts.length} contracts cover this outlet. Decide what happens to each — anything left is ceased.`}
          </AlertDialogDescription>
        </div>

        <ContractDispositionFields
          contracts={contracts}
          closingOutletId={outlet.id}
          value={map}
          onChange={setMap}
        />

        {formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-helper text-ink-secondary">{summarise(map)}</span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogClose render={<Button variant="secondary" disabled={isPending} />}>
              Cancel
            </AlertDialogClose>
            <Button onClick={handleConfirm} disabled={isPending || hasUnsetReassign(map)}>
              {isPending ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  Closing
                </>
              ) : (
                "Close outlet"
              )}
            </Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Entity close ─────────────────────────────────────────────────────────────────────────

type OutletChoice = {
  action: EntityOutletAction;
  toEntityId: string;
  contracts: DispositionMap;
};

/**
 * One open outlet under the closing entity: Transfer to another entity, or Close (which reveals
 * that outlet's contract dispositions). Fetches its own related contracts, but only once Close is
 * chosen — the null key while on Transfer means no request.
 */
function EntityOutletRow({
  outlet,
  entities,
  closingEntityId,
  choice,
  onChange,
}: {
  outlet: Outlet;
  entities: Entity[];
  closingEntityId: string;
  choice: OutletChoice;
  onChange: (next: OutletChoice) => void;
}) {
  const { data: contracts, isLoading } = useOutletRelatedContracts(
    outlet.id,
    choice.action === "close",
  );

  // Seed the contract disposition map once its contracts arrive. This writes to the *parent's*
  // `choices`, so it must not happen during render — doing so is the React error "Cannot update a
  // component while rendering a different one". It goes in an effect that fires when the fetch
  // resolves, guarded so it seeds exactly once and never overwrites a disposition already picked.
  const needsSeed =
    choice.action === "close" &&
    !!contracts &&
    contracts.length > 0 &&
    Object.keys(choice.contracts).length === 0;
  React.useEffect(() => {
    if (needsSeed && contracts) onChange({ ...choice, contracts: initialMap(contracts) });
    // Keyed on the fetch resolving, not on `choice`/`onChange` identity (both churn every render);
    // the `needsSeed` guard makes any re-run a no-op, so this seeds once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSeed]);

  const transferTargets = entities.filter(
    (entity) => entity.id !== closingEntityId && entity.status !== "closed",
  );

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{outlet.name}</span>
        <SegmentedControl<EntityOutletAction>
          label={`What to do with ${outlet.name}`}
          value={choice.action}
          options={[
            { value: "transfer", label: "Transfer" },
            { value: "close", label: "Close" },
          ]}
          onChange={(action) => onChange({ ...choice, action })}
        />
      </div>

      {choice.action === "transfer" ? (
        <Select
          containerClassName="w-full sm:w-64"
          aria-label={`Transfer ${outlet.name} to`}
          value={choice.toEntityId}
          onChange={(event) => onChange({ ...choice, toEntityId: event.target.value })}
        >
          <option value="">Transfer to…</option>
          {transferTargets.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </Select>
      ) : isLoading ? (
        <p className="text-helper text-ink-secondary">Loading contracts…</p>
      ) : contracts && contracts.length > 0 ? (
        <ContractDispositionFields
          contracts={contracts}
          closingOutletId={outlet.id}
          value={choice.contracts}
          onChange={(next) => onChange({ ...choice, contracts: next })}
        />
      ) : (
        <p className="text-helper text-ink-secondary">No contracts cover this outlet.</p>
      )}
    </li>
  );
}

/**
 * The entity-close pop-up — the two-level flow. Opened by the entity form in place of a
 * status→closed PATCH when the entity has open outlets.
 */
export function EntityCloseDialog({
  entity,
  outlets,
  open,
  onOpenChange,
  onClosed,
}: {
  entity: Entity;
  /** The still-open outlets under this entity (the form filtered them). */
  outlets: Outlet[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed?: () => void;
}) {
  const { close } = useEntityMutations();
  const { entities } = useEntityIndex();
  const { run, reset, isPending, formError } = useSubmit();

  const initialChoices = React.useCallback((): Record<string, OutletChoice> => {
    const map: Record<string, OutletChoice> = {};
    // Default each outlet to Close — the safe cascade an omitted outlet takes server-side too.
    for (const outlet of outlets) map[outlet.id] = { action: "close", toEntityId: "", contracts: {} };
    return map;
  }, [outlets]);

  const [choices, setChoices] = React.useState<Record<string, OutletChoice>>(initialChoices);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChoices(initialChoices());
  }

  const transferMissingTarget = Object.values(choices).some(
    (choice) => choice.action === "transfer" && !choice.toEntityId,
  );
  const reassignMissingTarget = Object.values(choices).some(
    (choice) => choice.action === "close" && hasUnsetReassign(choice.contracts),
  );

  async function handleConfirm() {
    const outlet_dispositions: EntityOutletDisposition[] = Object.entries(choices).map(
      ([outlet_id, choice]) =>
        choice.action === "transfer"
          ? { outlet_id, action: "transfer", to_entity_id: choice.toEntityId }
          : {
              outlet_id,
              action: "close",
              contract_dispositions: toDispositions(choice.contracts),
            },
    );
    const body: EntityCloseBody = { outlet_dispositions };

    const ok = await run(async () => {
      await close(entity.id, body);
      toast.success(`${entity.name} closed`);
    });
    if (ok) {
      onOpenChange(false);
      onClosed?.();
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="sm:max-w-2xl">
        <div className="flex flex-col gap-1.5">
          <AlertDialogTitle>Close {entity.name}</AlertDialogTitle>
          <AlertDialogDescription>
            {outlets.length === 1
              ? "One outlet is still open under this company. Transfer it to another company, or close it."
              : `${outlets.length} outlets are still open under this company. Transfer each to another company, or close it.`}
          </AlertDialogDescription>
        </div>

        <ul className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto">
          {outlets.map((outlet) => (
            <EntityOutletRow
              key={outlet.id}
              outlet={outlet}
              entities={entities}
              closingEntityId={entity.id}
              choice={choices[outlet.id] ?? { action: "close", toEntityId: "", contracts: {} }}
              onChange={(next) => setChoices((current) => ({ ...current, [outlet.id]: next }))}
            />
          ))}
        </ul>

        {formError ? (
          <p role="alert" className="rounded-lg bg-error-tint p-3 text-helper text-error">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogClose render={<Button variant="secondary" disabled={isPending} />}>
            Cancel
          </AlertDialogClose>
          <Button
            onClick={handleConfirm}
            disabled={isPending || transferMissingTarget || reassignMissingTarget}
          >
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
                Closing
              </>
            ) : (
              "Close company"
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
