"use client";

import type { BrandSummary, Influencer } from "@brandfactory/shared";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { useSubmit } from "@/hooks/use-submit";
import { INFLUENCER_STATUS_OPTIONS, INFLUENCER_VERTICAL_OPTIONS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { GENERALIST } from "../format";
import { useInfluencerMutations } from "../hooks";
import { type FieldEdit, isUnchanged, patchFor } from "../patch";
import { BrandPicker } from "./brand-picker";
import { EditPencil, type EditorSlot } from "./editable-cell";

/**
 * The four editors, and the one write behind them.
 *
 * ── One hook for the table, not one per row ───────────────────────────────
 *
 * {@link useInlineEdit} is called **once**, by the component that renders the rows. It is
 * tempting to call it per row — the pending state is per cell, after all — but
 * `useInfluencerMutations` reaches `useActiveWorkspace`, which is an SWR subscription plus a
 * `useSyncExternalStore` subscription, and 146 of each to serve one `PATCH` at a time is a cost
 * with nothing on the other side of it. `commit` takes the creator as an argument instead, and
 * each cell keeps its own `isPending` in a plain `useState` around the await.
 *
 * ── Nothing is optimistic, and the failure has to say so ──────────────────
 *
 * AGENTS.md: *"the API applies domain rules […] so the server's answer is the only one worth
 * rendering."* That holds here — a brand from another workspace is a 400 `BRAND_NOT_IN_WORKSPACE`
 * — so the cell renders what comes back and the value reverts on a refusal.
 *
 * **A refusal gets a toast; a success does not.** The reverting cell is otherwise an unexplained
 * flicker, so the server's own sentence has to appear somewhere. A success needs no toast because
 * the cell itself is the confirmation: the new value is on screen because the server sent it back,
 * which is the whole point of not being optimistic — and a toast per status change on a table
 * somebody is working down would be noise over information.
 *
 * The shaping is `use-submit`'s, which is why this hook does not read the error itself: that hook
 * is the one place in this app that knows a refusal arrives as **two classes** — `ApiError` from
 * the Operations Hub transport and `AppError` from the BrandFactory one — and AGENTS.md records
 * that a ladder knowing only the first told readers the backend was down for a whole release.
 */

export function useInlineEdit() {
  const { update } = useInfluencerMutations();
  const { run, reset, formError } = useSubmit();

  // The toast is fired here rather than at the call site because `formError` is derived state and
  // is not readable in the tick `run` resolves in. `reset()` clears it straight after, so two
  // identical refusals in a row each get their own toast instead of the second being swallowed as
  // an unchanged dependency.
  React.useEffect(() => {
    if (!formError) return;
    toast.error(formError);
    reset();
  }, [formError, reset]);

  /**
   * Write one field. Resolves `true` when the cell may close.
   *
   * Three outcomes and only one of them is a request:
   * - **Unchanged** → `true`, no request. The guard that matters is the text editor's blur: click
   *   into a name and click out, and without this the app writes, sweeps two cache scopes and
   *   refetches the whole roster to store what was already there.
   * - **Unwritable** → `false` with a local message. `patchFor` answers `null` for a cleared name,
   *   which is `InfluencerNameSchema`'s `.min(1)` refused here rather than round-tripped into a
   *   400 the reader cannot act on any better for having waited.
   * - **A patch of exactly one key** → the request.
   */
  const commit = React.useCallback(
    async (influencer: Influencer, edit: FieldEdit): Promise<boolean> => {
      if (isUnchanged(influencer, edit)) return true;

      const patch = patchFor(edit);
      if (!patch) {
        toast.error(
          edit.field === "name"
            ? "A creator needs a name."
            : "That value cannot be saved. Reopen the editor and choose again.",
        );
        return false;
      }

      return run(() => update(influencer.id, patch));
    },
    [run, update],
  );

  return { commit };
}

/** What every editor below is handed: the cell's own {@link EditorSlot} plus who is being edited. */
type EditorProps = EditorSlot & {
  influencer: Influencer;
  commit: (influencer: Influencer, edit: FieldEdit) => Promise<boolean>;
};

/**
 * Run a commit and settle the cell.
 *
 * Shared by the three inline editors because the sequence is the same and getting it wrong is
 * invisible: mark pending, await, unmark, close.
 *
 * **The cell closes on a refusal too.** The draft goes with the editor and the toast carries the
 * server's reason, which is better than leaving a rejected value sitting in a box that still looks
 * saveable — a reader would go on pressing `Enter` at it. The only refusal anybody can act on
 * locally is an empty name, and reopening is one keystroke. The brand picker is the exception and
 * says why in its own docstring.
 */
async function settle(edit: FieldEdit, props: EditorProps): Promise<void> {
  const { influencer, commit, close, setPending } = props;
  setPending(true);
  await commit(influencer, edit);
  setPending(false);
  close();
}

/**
 * The name — text, committed on `Enter` and on blur.
 *
 * **The slug does not follow**, which is `UpdateInfluencerInputSchema`'s decision rather than this
 * component's: it is frozen at create, so `/influencers/priya-raman` can end up pointing at a
 * record that reads *Priya Nair*. That is the trade every renamed outlet already makes, and the
 * alternative is a URL that rots whenever somebody fixes a spelling.
 */
export function NameEditor(props: EditorProps) {
  const { influencer, className, disabled } = props;
  const [value, setValue] = React.useState(influencer.name);
  // One ref for two jobs, both of which are about the blur that fires when the input unmounts:
  // `Enter` commits and then closes, and `Escape` cancels and then closes, and in both cases the
  // browser may fire `blur` on the way out. Without this, `Enter` writes twice and `Escape` writes
  // the value it was cancelling.
  const settled = React.useRef(false);

  const submit = () => {
    if (settled.current) return;
    settled.current = true;
    void settle({ field: "name", value }, props);
  };

  return (
    <Input
      autoFocus
      maxLength={200}
      value={value}
      disabled={disabled}
      // Select-all on focus: the common edit is a respelling of the whole name rather than an
      // insertion, and a caret dropped wherever the click landed makes the reader clear it first.
      onFocus={(event) => event.target.select()}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          // The row is inside no form, but a stray `Enter` still belongs to this input alone.
          event.preventDefault();
          submit();
        }
        // Claimed before the parent's handler closes the cell, so the blur that follows knows the
        // reader cancelled rather than committed.
        if (event.key === "Escape") settled.current = true;
      }}
      onBlur={submit}
      className={cn(className, "font-medium")}
      aria-label={`Name of ${influencer.name}`}
    />
  );
}

/**
 * A closed enum, committed the moment the platform says the reader chose.
 *
 * ── Why `change` and not blur ─────────────────────────────────────────────
 *
 * `change` on a native `<select>` **is** the platform's "the reader chose this" event, and a
 * control that visibly moves to `Active` and then does nothing until you click elsewhere is a
 * control that lies about having taken your input.
 *
 * The cost is real and is bounded rather than argued away: arrow keys on a *closed* select fire
 * `change` per press, so a keyboard user stepping through three statuses could fire three writes.
 * The editor is **disabled while the write is in flight**, which caps it at one write per open —
 * the first press writes, the control locks, and the cell closes on the answer. That is one
 * surprising write at worst, on a value the reader did pass through, and it is correctable with
 * one more click. The alternative caps nothing and races: three `PATCH`es in flight over one
 * column, settling in whatever order they return.
 */
function EnumEditor({
  field,
  options,
  value,
  emptyOption,
  label,
  ...props
}: EditorProps & {
  field: "vertical" | "status";
  options: readonly { value: string; label: string }[];
  value: string;
  /** The `""` option, where the field has one. `Generalist` is a stated fact, not a blank. */
  emptyOption?: string;
  label: string;
}) {
  const { className, disabled } = props;

  return (
    <Select
      autoFocus
      value={value}
      disabled={disabled}
      // Written as a branch rather than as `{field, value} as FieldEdit`: the union is
      // discriminated, and a cast over it is what lets a fifth field slip through without a
      // matching branch in `patchFor`.
      onChange={(event) =>
        void settle(
          field === "vertical"
            ? { field: "vertical", value: event.target.value }
            : { field: "status", value: event.target.value },
          props,
        )
      }
      // `pr-7` after the shared `px-1`: the chevron is positioned against the wrapper at 12px, so
      // without room reserved for it the longest option would run underneath it.
      className={cn(className, "pr-7")}
      containerClassName="min-w-0"
      aria-label={label}
    >
      {emptyOption === undefined ? null : <option value="">{emptyOption}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export function VerticalEditor(props: EditorProps) {
  return (
    <EnumEditor
      {...props}
      field="vertical"
      options={INFLUENCER_VERTICAL_OPTIONS}
      value={props.influencer.vertical ?? ""}
      // The union has no `other` member on purpose, so the empty option is named rather than left
      // blank: a creator who covers no one vertical is a *generalist*, not an unclassified row.
      emptyOption={GENERALIST}
      label={`Vertical of ${props.influencer.name}`}
    />
  );
}

export function StatusEditor(props: EditorProps) {
  return (
    <EnumEditor
      {...props}
      field="status"
      options={INFLUENCER_STATUS_OPTIONS}
      value={props.influencer.status}
      label={`Status of ${props.influencer.name}`}
    />
  );
}

/**
 * The brands — a **popover**, not an inline swap, and an explicit `Save`.
 *
 * ── Why it is the one editor with a button ────────────────────────────────
 *
 * `BrandPicker`'s own docstring settles this: *"A picker that wrote on every tick would fire a
 * request per box while somebody works down the list — and each one would be a full replacement,
 * so an interrupted pass would leave a set nobody chose."* That is exactly the shape of the write
 * here, so the picker keeps its rule and the popover supplies the moment.
 *
 * A column of checkboxes also cannot live inside a 24px cell, which is why this is the one editor
 * that does not use `EditableCell`'s swap. `Popover` rather than `DropdownMenu`, per AGENTS.md: a
 * panel of form controls in a `role="menu"` announces "menu, N items" over N checkboxes and fights
 * their keyboard handling.
 *
 * ── The draft resets on open, during render ───────────────────────────────
 *
 * The popup's content survives its close, so a draft left from last time is what a reader would
 * find on reopening — the wedge AGENTS.md records twice for sheets. The fix is the same and it is
 * **not** a key: the draft is re-seeded during render when `open` flips true, which is React's own
 * adjust-state-on-prop-change pattern and also not the `set-state-in-effect` rule that fails this
 * build.
 */
export function BrandsEditor({
  influencer,
  commit,
  brands,
  brandsLoading,
  display,
}: {
  influencer: Influencer;
  commit: (influencer: Influencer, edit: FieldEdit) => Promise<boolean>;
  brands: BrandSummary[];
  brandsLoading: boolean;
  /** The cell's own rendering of the brand set, which this only puts a pencil beside. */
  display: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const [draft, setDraft] = React.useState<string[]>(influencer.brandIds);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(influencer.brandIds);
  }

  /**
   * **The panel stays open on a refusal**, unlike the three inline editors.
   *
   * The refusal this write actually takes is `BRAND_NOT_IN_WORKSPACE`, and it names a box the
   * reader can untick. Closing the panel would throw away a set they may have spent several ticks
   * building, to make them rebuild it in order to change one thing.
   */
  async function save() {
    setIsPending(true);
    const ok = await commit(influencer, { field: "brandIds", value: draft });
    setIsPending(false);
    if (ok) setOpen(false);
  }

  return (
    <span className="flex items-center gap-1">
      {display}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<EditPencil label="brands" className="ml-auto" />} />
        <PopoverContent align="end" className="flex w-72 flex-col gap-3">
          <p className="text-helper text-ink-secondary">
            {/* The relation is a set and the wire is a full replacement, so the panel says what
                ticking nothing means rather than leaving it to be discovered. */}
            Which brands {influencer.name} is engaged for. Ticking none says they are a prospect.
          </p>
          <BrandPicker
            selected={draft}
            brands={brands}
            isLoading={brandsLoading}
            onChange={setDraft}
            disabled={isPending}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={isPending} onClick={() => void save()}>
              {isPending ? "Saving" : "Save"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
