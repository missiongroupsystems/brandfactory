"use client";

import type { BrandSummary, Influencer } from "@brandfactory/shared";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSubmit } from "@/hooks/use-submit";
import { INFLUENCER_STATUS_OPTIONS, INFLUENCER_VERTICAL_OPTIONS } from "@/lib/labels";

import { GENERALIST } from "../format";
import { useInfluencerMutations } from "../hooks";
import { type FieldEdit, isUnchanged, patchFor } from "../patch";
import { BrandPicker } from "./brand-picker";
import { CellTrigger } from "./editable-cell";

/**
 * The three cell editors, and the one write behind them.
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
 * ── Every editor is now a popup, and that is the shape of this release ────
 *
 * There is no display-to-editor **swap** left on this table. A cell used to turn into a text box
 * or a native select in place; three of them now open something anchored to the cell — a menu, a
 * checkbox popover, the accounts panel — and the fourth, the Creator name, stopped being editable
 * from the table at all. `editable-cell.tsx` is what they share, and it is one button rather than
 * a swap harness.
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
   * - **Unchanged** → `true`, no request. The guard earns its place on the accounts panel, which
   *   opens on a draft of the whole list: opening it and pressing `Save` without touching a box
   *   would otherwise replace ten child rows, sweep two cache scopes and refetch the roster to
   *   store what was already there.
   * - **Unwritable** → `false` with a local message. `patchFor` answers `null` for a value outside
   *   its schema — an account list the shared rules refuse, most of all — which is a 400 refused
   *   here rather than round-tripped into one the reader cannot act on any better for having
   *   waited.
   * - **A patch of exactly one key** → the request.
   */
  const commit = React.useCallback(
    async (influencer: Influencer, edit: FieldEdit): Promise<boolean> => {
      if (isUnchanged(influencer, edit)) return true;

      const patch = patchFor(edit);
      if (!patch) {
        toast.error(
          edit.field === "accounts"
            ? "Those accounts cannot be saved. Check the handles and the follower counts."
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

/** What every editor below is handed: who is being edited, and the write. */
type EditorProps = {
  influencer: Influencer;
  commit: (influencer: Influencer, edit: FieldEdit) => Promise<boolean>;
  /** The cell's own rendering of the value, which the trigger wraps or sits beside. */
  display: React.ReactNode;
};

/**
 * A closed enum, chosen from a **menu anchored to the cell**.
 *
 * ── Why a menu and not the native select this replaces ────────────────────
 *
 * `DropdownMenu` with `menuitemradio` children is the clear side of the line AGENTS.md draws
 * between a menu and a popover: this is a single choice from a closed list, not a panel of form
 * controls, so `role="menu"` is what it actually is. The Brands picker below keeps its `Popover`
 * for the same rule read the other way — a column of checkboxes in a `role="menu"` announces
 * "menu, N items" and fights their keyboard handling.
 *
 * ── It retires a bounded defect rather than only restyling one ────────────
 *
 * The native `<select>` it replaces committed on `change`, which **is** the platform's "the reader
 * chose this" event — and the cost was written down rather than argued away: arrow keys on a
 * *closed* select fire `change` per press, so a keyboard user stepping through three statuses
 * could fire three writes. It was capped at one per open only because the control disabled itself
 * mid-flight, which is a race won by a lock rather than a case that does not exist.
 *
 * A menu moves a **highlight** on the arrow keys and commits on `Enter` or on click. Stepping
 * through the list writes nothing. The case stops existing.
 *
 * ── The open state is controlled, and closing is this file's job ──────────
 *
 * Base UI's `Menu.RadioItem` does not close the popup on select by default — a radio group is
 * often something you tick more than once. Here it is exactly one choice, so the menu is closed
 * from `onValueChange` before the write is even started. Leaving it open over a cell that is
 * already saving would offer a second choice the disabled trigger has no way to refuse.
 */
function EnumMenu({
  field,
  options,
  value,
  emptyOption,
  label,
  influencer,
  commit,
  display,
}: EditorProps & {
  field: "vertical" | "status";
  options: readonly { value: string; label: string }[];
  value: string;
  /** The `""` option, where the field has one. `Generalist` is a stated fact, not a blank. */
  emptyOption?: string;
  label: string;
}) {
  const [open, setOpen] = React.useState(false);
  // Per cell rather than per row: it lives exactly as long as one write, and a row holding one
  // flag per editable column would need three.
  const [isPending, setIsPending] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  /**
   * Focus back to the trigger when the write settles.
   *
   * ── Why this is needed, and why no test could see it without help ─────────
   *
   * `CellTrigger` disables itself while `pending`, and {@link choose} closes the menu and sets that
   * flag in **one commit**. So Base UI restores focus to a trigger that is already disabled, and a
   * browser then applies the HTML focus fixup rule: an element that becomes disabled is blurred,
   * and focus falls to `document.body`. The trigger is enabled again when the write returns, but
   * nothing puts focus back on it — so a keyboard reader who changed one status was dropped at the
   * top of a 146-row table.
   *
   * **jsdom does not implement that rule.** A focused button stays `document.activeElement` there
   * after `disabled` is set, which is why every test in this file passed over the defect. The test
   * that covers it emulates the blur explicitly and says so.
   *
   * The `EditableCell` this release deleted held the same property for the same reason — *"a
   * keyboard user who cancels an edit must not be dropped on `document.body` in the middle of a
   * 146-row table"* — and kept it the same way: an effect, but not the banned one, because it sets
   * no state and moves focus, which is a DOM side effect with nowhere else to live.
   *
   * **Only out of `document.body`.** A reader who moved on during the request — into the search
   * box, into another cell — keeps the focus they chose. Restoring unconditionally would take it
   * back off them a few hundred milliseconds after they moved it.
   */
  const wasPending = React.useRef(false);
  React.useEffect(() => {
    if (wasPending.current && !isPending && document.activeElement === document.body) {
      triggerRef.current?.focus();
    }
    wasPending.current = isPending;
  }, [isPending]);

  async function choose(next: string) {
    setOpen(false);
    setIsPending(true);
    await commit(
      influencer,
      // Written as a branch rather than as `{field, value} as FieldEdit`: the union is
      // discriminated, and a cast over it is what lets a fourth field slip through without a
      // matching branch in `patchFor`.
      field === "vertical"
        ? { field: "vertical", value: next }
        : { field: "status", value: next },
    );
    setIsPending(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <CellTrigger ref={triggerRef} label={label} chevron pending={isPending} className="w-full" />
        }
      >
        {display}
      </DropdownMenuTrigger>
      {/* `align="start"`, so the list opens under the value rather than under the chevron — both
          these columns are read from their left edge.

          **`w-auto` over the primitive's `w-(--anchor-width)`.** A menu the width of its anchor
          would be the width of a 14%-share table column, and "Family & lifestyle" does not fit in
          one. The floor keeps the short options from rendering as a sliver. */}
      <DropdownMenuContent align="start" className="w-auto min-w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => void choose(String(next))}>
          {emptyOption === undefined ? null : (
            <DropdownMenuRadioItem value="">{emptyOption}</DropdownMenuRadioItem>
          )}
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VerticalEditor(props: EditorProps) {
  return (
    <EnumMenu
      {...props}
      field="vertical"
      options={INFLUENCER_VERTICAL_OPTIONS}
      value={props.influencer.vertical ?? ""}
      // The union has no `other` member on purpose, so the empty option is named rather than left
      // blank: a creator who covers no one vertical is a *generalist*, not an unclassified row.
      emptyOption={GENERALIST}
      label={`Edit the vertical of ${props.influencer.name}`}
    />
  );
}

export function StatusEditor(props: EditorProps) {
  return (
    <EnumMenu
      {...props}
      field="status"
      options={INFLUENCER_STATUS_OPTIONS}
      value={props.influencer.status}
      label={`Edit the status of ${props.influencer.name}`}
    />
  );
}

/**
 * The brands — a **popover**, and an explicit `Save`.
 *
 * ── Why it is the one editor with a button ────────────────────────────────
 *
 * `BrandPicker`'s own docstring settles this: *"A picker that wrote on every tick would fire a
 * request per box while somebody works down the list — and each one would be a full replacement,
 * so an interrupted pass would leave a set nobody chose."* That is exactly the shape of the write
 * here, so the picker keeps its rule and the popover supplies the moment.
 *
 * `Popover` rather than `DropdownMenu`, per AGENTS.md: a panel of form controls in a `role="menu"`
 * announces "menu, N items" over N checkboxes and fights their keyboard handling.
 *
 * ── The trigger is a sibling, not a wrapper ───────────────────────────────
 *
 * This is the third cell on the table whose display carries **its own interactive content** — the
 * Brands cell renders `NamesTooltip` on a real button whenever a creator has more than one brand,
 * and a button inside a button is what this feature refuses to write. So the trigger sits beside
 * the value and takes the rest of the cell (`flex-1`), which leaves the DOM with two peers and
 * the cell reading as one control. The floor is there because the names can fill a 13%-share
 * column on their own, and a `flex-1` with nothing left to claim is a target 0px wide.
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
  /** The cell's own rendering of the brand set, which the trigger sits beside. */
  display: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const [draft, setDraft] = React.useState<string[]>(influencer.brandIds);

  /**
   * The draft resets on open, **during render**.
   *
   * The popup's content survives its close, so a draft left from last time is what a reader would
   * find on reopening — the wedge AGENTS.md records twice for sheets. The fix is the same and it
   * is **not** a key: the draft is re-seeded during render when `open` flips true, which is
   * React's own adjust-state-on-prop-change pattern and also not the `set-state-in-effect` rule
   * that fails this build.
   */
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(influencer.brandIds);
  }

  /**
   * **The panel stays open on a refusal**, unlike the enum menus above.
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
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate">{display}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <CellTrigger
              label={`Edit the brands of ${influencer.name}`}
              // **No chevron here**, unlike the two enum cells. The chevron means *this opens a
              // list you pick one thing from*; this opens a panel of checkboxes with an explicit
              // `Save`, which is a different promise. It also costs width the Brands column does
              // not have — the names already truncate at `max-w-[24ch]`, and this sibling is
              // taking room the pencil took less of.
              className="min-w-6 flex-1"
            />
          }
        />
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
