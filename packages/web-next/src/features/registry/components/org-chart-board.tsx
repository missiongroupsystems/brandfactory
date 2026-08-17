"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CheckIcon, GripVerticalIcon, Loader2Icon, MoreHorizontalIcon } from "lucide-react";

import { useBrandIndex } from "@/features/registry-brands/hooks";
import { useEntityIndex, useOutletIndex, useOutletMutations } from "@/features/registry/hooks";
import { SegmentedControl } from "@/components/layout/filter-bar";
import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryFilters } from "@/hooks/use-query-filters";
import { PENDING } from "@/lib/format";
import {
  BRAND_STATUS_LABELS,
  BRAND_STATUS_TONES,
  ENTITY_STATUS_LABELS,
  ENTITY_STATUS_TONES,
  OUTLET_STATUS_LABELS,
  OUTLET_STATUS_TONES,
  OUTLET_TYPE_LABELS,
  type BadgeTone,
} from "@/lib/labels";
import { ApiError } from "@/lib/api/client";
import type { Brand, Entity, Outlet, OutletUpdate } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { outletHref } from "@/lib/outlet-href";

/**
 * The org chart — a map of what holds which outlet, and the place you change it.
 *
 * **Stages 2 and 3 of `docs/archive/org-chart-outlet-editing.md`, then Stage 6 of
 * `docs/archive/brands.md`.** Stage 2 was the read-only board; Stage 3 made an outlet
 * re-linkable by dragging its chip onto another company's card, or onto the tray to clear the
 * link. Stage 6 gave the same board a second grouping dimension — brand — behind `?by=`.
 *
 * It lives in `features/registry/` rather than a folder of its own: an org chart is a registry
 * view over the same outlets, entities and brands the tables here already read, off the same
 * service layer.
 *
 * Five decisions worth reading before changing anything:
 *
 * - **One board, two dimensions, and the parameterisation is not the interesting half.**
 *   Swapping `entity_id` for `brand_id` is four lines. What actually had to be written is
 *   `BOARD_COPY` below — the headings, the tray, the menu, the toast and four screen-reader
 *   sentences, each phrased for its own dimension rather than templated off a noun. A board
 *   that says "company" while grouping by brand is the defect this stage existed to avoid.
 * - **The whole estate is loaded, never a page — and that means every list the board draws
 *   from.** `useOutletIndex()`, `useEntityIndex()` and `useBrandIndex()` each walk the cursor
 *   to exhaustion. On a map an absent row is a lie, not a truncation — a reader takes it as
 *   "this brand holds two outlets" rather than "you are on page one". The *group* half is the
 *   easier one to forget and the more expensive one to get wrong: an undrawn card takes every
 *   outlet it holds off the board with it. Three things enforce the invariant that **every
 *   outlet is drawn exactly once, in both modes** — the walks, the banner when one stops early,
 *   and `MissingGroupSection` for anything that slips both.
 * - **The tray comes first because it is the only to-do list on the page.** Everything below it
 *   is a statement of fact; the tray is a set of decisions nobody has made.
 * - **Sorting is safe here and nowhere else in the product.** `AGENTS.md` forbids sortable
 *   columns because a paginated table can only sort the page it has, putting "Zephyr" above an
 *   unfetched "Alma". That reasoning does not reach a view holding the complete set, and
 *   alphabetical is how somebody finds a company on a board of eighteen.
 * - **A drop is not optimistic**, which is the whole reason `DragOverlay` is here. See below.
 *
 * **A brand is never inherited from an entity** (`docs/plans/brands.md` §1.2), and this is the
 * screen that could most easily break the rule: dragging a chip between company cards is one
 * `PATCH` to `entity_id`, and if brand fell back to the holding company that drag would silently
 * rewrite every past bucket of a brand-grouped report. Nothing here reads one dimension to answer
 * the other — `move` writes exactly the field the current board groups by, and the chip's
 * sub-label reads `entity_id` off the outlet itself.
 */

/**
 * Where a drop lands: **the target under the pointer**, falling back to the nearest centre.
 *
 * `closestCenter` alone is wrong for this board, and the same two drags were run against both to
 * be sure of it. It compares the dragged chip's centre with each droppable's centre, and the
 * droppables here are cards of wildly different heights plus one very wide tray — so the nearest
 * centre is routinely not the thing under the cursor. Measured:
 *
 * - dropping a chip **back onto its own card** fired a PATCH, when the only correct answer is
 *   nothing at all — the drop had resolved to a neighbouring company;
 * - dropping a chip **on the tray** moved the outlet to *Bugis Street Hospitality* instead of
 *   clearing its holding entity. That is the worst case on this screen: an un-link silently
 *   becoming a re-link to a company nobody pointed at, reported by a toast that names it as if
 *   it were intended.
 *
 * `pointerWithin` puts the drop where the cursor actually is, which is the only rule a person
 * dragging something will accept, and it fixed all of the above. It returns nothing when there is
 * no pointer — exactly the keyboard case — so `closestCenter` stays as the fallback, where
 * "nearest" *is* the right answer and where it was verified working.
 */
const collisionDetection: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  return under.length > 0 ? under : closestCenter(args);
};

/** The tray's droppable id. Cards use `<prefix>:<uuid>`, so the two can never collide. */
const TRAY_DROPPABLE = "tray";
const cardDroppable = (prefix: string, groupId: string) => `${prefix}:${groupId}`;

/**
 * `undefined` means "not a drop target at all" — dropped on nothing, which must stay distinct from
 * `null`, the tray, which means "clear the link". Collapsing the two would turn a mis-aimed drop
 * into an un-linking nobody asked for.
 *
 * The prefix is the board's, so a `brand:` id can never resolve on the company board even if one
 * were somehow left in the DOM across a mode switch.
 */
function targetGroupId(overId: string | undefined, prefix: string): string | null | undefined {
  if (!overId) return undefined;
  if (overId === TRAY_DROPPABLE) return null;
  if (overId.startsWith(`${prefix}:`)) return overId.slice(prefix.length + 1);
  return undefined;
}

// ── The dimension ──────────────────────────────────────────────────────────────────────

/** The two boards. The URL carries this value under `?by=`. */
type DimensionKey = "company" | "brand";

const DEFAULT_DIMENSION: DimensionKey = "company";

/**
 * One reading of `?by=`, not one per consumer.
 *
 * `AGENTS.md`'s rule for `?flag=`: the moment the segmented control, the grouping and the copy
 * each decide for themselves what the URL said, one of them disagrees with the table. Anything
 * that is not exactly `brand` is the company board, so a stale or hand-edited link lands on the
 * default rather than on a blank screen.
 */
function readDimension(value: string | undefined): DimensionKey {
  return value === "brand" ? "brand" : DEFAULT_DIMENSION;
}

/** `useQueryFilters` needs a module-level array, or its memo is useless. */
const VIEW_KEYS = ["by"] as const;

/**
 * One card on the board, whatever it is a card of.
 *
 * An `Entity` and a `Brand` share an id, a name and a status and nothing else — so rather than
 * hand the card a union and let it re-derive which it has, each is flattened to this on the way
 * in. The card then has no idea which board it is on, which is what stops the two drifting.
 */
type BoardGroup = {
  id: string;
  name: string;
  statusLabel: string;
  statusTone: BadgeTone;
  /** Not the live status of its own vocabulary — muted, never hidden, and still a drop target. */
  muted: boolean;
  /** Where the card's title goes. */
  href: string;
  /** Anything else the header carries: the UEN in company mode, nothing in brand mode. */
  meta?: React.ReactNode;
};

function entityGroup(entity: Entity): BoardGroup {
  return {
    id: entity.id,
    name: entity.name,
    statusLabel: ENTITY_STATUS_LABELS[entity.status],
    statusTone: ENTITY_STATUS_TONES[entity.status],
    muted: entity.status !== "active",
    // There is no entity detail page. The outlet detail page already links a holding entity to
    // the entities list filtered to it, and this follows that rather than inventing a second
    // destination for the same click.
    href: `/entities?q=${encodeURIComponent(entity.name)}`,
    meta: entity.uen ? (
      <span className="font-mono text-helper text-ink-tertiary">{entity.uen}</span>
    ) : null,
  };
}

function brandGroup(brand: Brand): BoardGroup {
  return {
    id: brand.id,
    name: brand.name,
    statusLabel: BRAND_STATUS_LABELS[brand.status],
    statusTone: BRAND_STATUS_TONES[brand.status],
    muted: brand.status !== "active",
    // A brand *does* have a detail page, so this is the record itself rather than a filtered
    // list. The asymmetry with the company card is a fact about the product, not an oversight.
    href: `/registry-brands/${brand.id}`,
  };
}

/**
 * **The vocabulary — the actual work of the second board.**
 *
 * Every string a reader or a screen reader meets, per dimension, in one place. Written out twice
 * rather than templated off a noun, because "Move Kilo Lounge to another brand" and "Set Kilo
 * Lounge's brand" are not the same sentence with a word swapped, and the four announcements are
 * read aloud — a template that says "company" on the brand board is precisely the defect this
 * stage exists to avoid.
 *
 * The **tray label appears in the heading, in every toast and in every announcement, so it is one
 * constant per dimension**. That is why the brand tray is *"No brand yet"* and not the outlet
 * form's *"No brand"*: the form's is a select option naming a value, this is a heading over a set
 * of outlets. The company board has had exactly that split since it shipped — *"Not decided yet"*
 * here, *"Not decided"* in the form — so the two are consistent, not in disagreement.
 */
type DimensionCopy = {
  /** The outlet column this board groups by and writes to. */
  field: "entity_id" | "brand_id";
  /** Droppable id prefix. */
  prefix: string;
  /** The segmented control's own word. */
  switchLabel: string;
  sectionTitle: string;
  sectionDescription: string;
  /** The tray: one string for the heading, the toast and the announcements. */
  trayTitle: string;
  trayDescription: string;
  /** The tray's three empty cases — see `UnassignedTray`. */
  trayEmptyEstate: string;
  trayEmptyTruncated: string;
  trayEmptyAll: string;
  missingTitle: string;
  missingDescription: string;
  /** The menu's group label, and the trigger's accessible name. */
  menuLabel: string;
  menuName: (outlet: string) => string;
  /** A target that is not in the index — should be unreachable, and is worded anyway. */
  unknownTarget: string;
  /** The word the truncation banner uses for this board's cards. */
  truncationTerm: string;
  emptyMessage: string;
  emptyHint: string;
  instructions: string;
  announce: {
    start: (outlet: string) => string;
    over: (outlet: string, target: string) => string;
    overNothing: (outlet: string) => string;
    end: (outlet: string, target: string) => string;
    endNothing: (outlet: string) => string;
    cancel: (outlet: string) => string;
  };
};

const BOARD_COPY: Record<DimensionKey, DimensionCopy> = {
  company: {
    field: "entity_id",
    prefix: "entity",
    switchLabel: "By company",
    sectionTitle: "Companies",
    sectionDescription:
      "Every operating company, including those holding nothing — an empty company is information, and it is somewhere to drop an outlet.",
    // "Not decided yet" is the outlet detail page's wording for the same state, deliberately
    // reused. `outlet.entity_id` is nullable by design — a pipeline project exists before anyone
    // settles which company will run it — so the two screens phrasing it differently would make
    // a considered null look like a broken record.
    trayTitle: "Not decided yet",
    trayDescription:
      "No holding entity chosen. On a pipeline project that is a decision outstanding rather than a gap — which is why this sits at the top of the page and the companies sit below it. Drop an outlet here to clear its holding entity.",
    trayEmptyEstate: "No outlets recorded yet.",
    trayEmptyTruncated: "None of the outlets loaded so far are missing a holding entity.",
    trayEmptyAll: "Every outlet has a holding entity.",
    missingTitle: "Held by a company not shown",
    missingDescription:
      "These outlets name a holding entity that is not on this board, so they belong to no card above. Use each outlet's menu to move it to a company that is shown, or to clear the link.",
    menuLabel: "Move to",
    menuName: (outlet) => `Move ${outlet} to another company`,
    unknownTarget: "a company",
    truncationTerm: "companies",
    emptyMessage: "No entities or outlets yet",
    emptyHint:
      "The org chart draws itself from the registry. Add a company on the Entities page and a location on the Outlets page, and they appear here.",
    instructions:
      "To move an outlet to another company, press space or enter on its drag handle. Use the arrow keys to choose a company card or the not-decided tray, then press space or enter again to move it. Press escape to cancel. Every move is also available from the outlet's menu button, which needs no dragging.",
    announce: {
      start: (outlet) =>
        `Picked up ${outlet}. Use the arrow keys to choose a company, then press space to move it.`,
      over: (outlet, target) => `${outlet} is over ${target}.`,
      overNothing: (outlet) => `${outlet} is not over a company.`,
      end: (outlet, target) => `Moving ${outlet} to ${target}.`,
      endNothing: (outlet) =>
        `${outlet} was dropped away from any company and stayed where it was.`,
      cancel: (outlet) => `Cancelled. ${outlet} stayed where it was.`,
    },
  },
  brand: {
    field: "brand_id",
    prefix: "brand",
    switchLabel: "By brand",
    sectionTitle: "Brands",
    sectionDescription:
      "Every brand, including those over no door yet — a brand with no outlets is a name the group holds, and it is somewhere to drop one.",
    trayTitle: "No brand yet",
    trayDescription:
      "No brand chosen. A one-off site legitimately has none, so this is not a queue of mistakes — but an outlet sitting here is invisible to every brand-grouped report. Drop an outlet here to clear its brand.",
    trayEmptyEstate: "No outlets recorded yet.",
    trayEmptyTruncated: "None of the outlets loaded so far are missing a brand.",
    trayEmptyAll: "Every outlet carries a brand.",
    missingTitle: "Carrying a brand not shown",
    missingDescription:
      "These outlets name a brand that is not on this board, so they belong to no card above. Use each outlet's menu to move it to a brand that is shown, or to clear the brand.",
    // "Move to" is the company board's verb because an outlet is *held by* one company at a
    // time. A brand is a name a site trades under, so the verb is set rather than move.
    menuLabel: "Set brand to",
    menuName: (outlet) => `Set the brand for ${outlet}`,
    unknownTarget: "a brand",
    truncationTerm: "brands",
    emptyMessage: "No brands or outlets yet",
    emptyHint:
      "This board draws itself from the registry. Add a brand on the Brands page and a location on the Outlets page, and they appear here.",
    instructions:
      "To set an outlet's brand, press space or enter on its drag handle. Use the arrow keys to choose a brand card or the no-brand tray, then press space or enter again to set it. Press escape to cancel. Every change is also available from the outlet's menu button, which needs no dragging.",
    announce: {
      start: (outlet) =>
        `Picked up ${outlet}. Use the arrow keys to choose a brand, then press space to set it.`,
      over: (outlet, target) => `${outlet} is over ${target}.`,
      overNothing: (outlet) => `${outlet} is not over a brand.`,
      end: (outlet, target) => `Setting ${outlet} to ${target}.`,
      endNothing: (outlet) => `${outlet} was dropped away from any brand and kept the one it had.`,
      cancel: (outlet) => `Cancelled. ${outlet} kept the brand it had.`,
    },
  },
};

/** The outlet's current group on this board. */
function groupIdOf(outlet: Outlet, field: DimensionCopy["field"]): string | null {
  return (field === "entity_id" ? outlet.entity_id : outlet.brand_id) ?? null;
}

/**
 * The write. Spelled out per field rather than built from a computed key, so the payload stays
 * `OutletUpdate` and a typo in `field` is a compile error rather than a silently ignored PATCH.
 */
function patchFor(field: DimensionCopy["field"], groupId: string | null): OutletUpdate {
  return field === "entity_id" ? { entity_id: groupId } : { brand_id: groupId };
}

type BoardContextValue = {
  copy: DimensionCopy;
  groups: BoardGroup[];
  /** Outlet ids with a PATCH in flight. A saving chip cannot be dragged or moved again. */
  saving: ReadonlySet<string>;
  move: (outlet: Outlet, groupId: string | null) => void;
  /** The outlet currently lifted, so its source chip can stay put and dim. */
  activeId: string | null;
  /** The chip's second line, which differs by board — see `subLabelFor`. */
  subLabel: (outlet: Outlet) => React.ReactNode;
};

const BoardContext = React.createContext<BoardContextValue | null>(null);

function useBoard() {
  const value = React.useContext(BoardContext);
  if (!value) throw new Error("Board components must render inside OrgChartBoard");
  return value;
}

export function OrgChartBoard() {
  const { filters, setFilter } = useQueryFilters(VIEW_KEYS);
  const by = readDimension(filters.by);
  const copy = BOARD_COPY[by];

  const {
    outlets,
    byId,
    hasMore,
    error: outletsError,
    isLoading: outletsLoading,
  } = useOutletIndex();
  const {
    entities,
    byId: entityById,
    hasMore: entitiesTruncated,
    error: entitiesError,
    isLoading: entitiesLoading,
  } = useEntityIndex();
  const {
    brands,
    hasMore: brandsTruncated,
    error: brandsError,
    isLoading: brandsLoading,
  } = useBrandIndex();
  const { update } = useOutletMutations();

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<ReadonlySet<string>>(() => new Set());

  const groups = React.useMemo(
    () =>
      (by === "brand" ? brands.map(brandGroup) : entities.map(entityGroup)).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [by, brands, entities],
  );

  const groupById = React.useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );

  /**
   * The outlets under each card, and the ones under none.
   *
   * Computed here rather than in `useOutletIndex`, which is where the company half used to live.
   * The hook's argument was that a grouping is a fact about the index and not about this screen —
   * true, and it stopped being the point the moment there were two of them. **One expression
   * serving both dimensions is what makes the two boards behave identically**; two hand-written
   * maps in the hook would be two chances to group, sort or bucket the null differently, and the
   * difference would show up as one board quietly disagreeing with the other.
   *
   * `ungrouped` is not an error state on either board: `entity_id` is nullable because a pipeline
   * project exists before anyone decides who will run it, and `brand_id` because a one-off site
   * legitimately has no brand.
   */
  const { byGroupId, ungrouped } = React.useMemo(() => {
    const byGroupId = new Map<string, Outlet[]>();
    const ungrouped: Outlet[] = [];

    for (const outlet of outlets) {
      const groupId = groupIdOf(outlet, copy.field);
      if (groupId) {
        const held = byGroupId.get(groupId);
        if (held) held.push(outlet);
        else byGroupId.set(groupId, [outlet]);
      } else {
        ungrouped.push(outlet);
      }
    }

    return { byGroupId, ungrouped };
  }, [outlets, copy.field]);

  /**
   * Outlets naming a card that is not on this board.
   *
   * Computed rather than inferred from the truncation flag, because the flag answers a narrower
   * question than the board needs. What matters is not "did the walk stop early" but "is every
   * outlet drawn somewhere" — and an outlet in this set is drawn nowhere by default: the tray
   * holds only the unset ones, and its card is absent. Whatever the cause, this is the one state
   * that must never be silent.
   */
  const orphaned = React.useMemo(() => {
    const held = new Set(groupById.keys());
    return outlets.filter((outlet) => {
      const groupId = groupIdOf(outlet, copy.field);
      return groupId !== null && !held.has(groupId);
    });
  }, [outlets, groupById, copy.field]);

  /**
   * The chip's second line — and, on the brand board only, a third carrying the company.
   *
   * The plan asked for the other dimension on the chip, so that brand mode is not the same picture
   * rearranged. Two things about how that is spent:
   *
   * **The status word stays, which the plan's `Restaurant · <company>` would have dropped.** This
   * file's own rule is that colour is never the only carrier of a state (§3.3 / WCAG 1.4.1), and
   * the status here is carried by a coloured dot *and* a word. Taking the word away to make room
   * would have left the dot alone, which is the one thing the dot is documented not to be allowed
   * to be.
   *
   * **The company then gets its own line rather than a third term, and that came from rendering
   * the page.** As one line it fitted, did not wrap, and was the same height as the company board
   * — every geometric check passed — and it read `Restaurant · Pipeline · Bug…`. A chip is ~190px
   * of text inside a card in a three-column grid, which is about 34 characters, and *"Bugis Street
   * Hospitality"* is 24 of them on its own. A truncated company name is worse than no company
   * name: `Bug…` cannot be told from a different company with the same first three letters, so it
   * looks like information and is not. This is 0.14.0's finding one release later — compression
   * paid for in a currency that gives nothing back — and the answer is the same, spend the space.
   *
   * The company board does **not** carry the brand in return, and the asymmetry is the point: on
   * the company board the card you are looking at is the company, so the useful extra is the
   * outlet's own status. Naming the brand there would also invite exactly the reading §1.2
   * forbids — that an outlet's brand has something to do with who holds it.
   */
  const subLabel = React.useCallback(
    (outlet: Outlet) => {
      const base = `${OUTLET_TYPE_LABELS[outlet.outlet_type]} · ${OUTLET_STATUS_LABELS[outlet.status]}`;
      const line = <span className="pl-3.5 text-helper text-ink-tertiary">{base}</span>;
      if (by !== "brand") return line;

      // Read off the outlet's own `entity_id`, never off its brand — the no-inheritance rule
      // (§1.2) runs in both directions, and this is the label a reader would most easily mistake
      // for one. `entitiesLoading` is false by the time the board renders (it is one of the two
      // gates below), so an id missing from the map is a company that is genuinely not on this
      // board rather than a request in flight — which is the distinction `AGENTS.md` insists on
      // and the reason this is not simply an em dash.
      const company = outlet.entity_id
        ? (entityById.get(outlet.entity_id)?.name ??
          (entitiesLoading ? PENDING : "Company not shown"))
        : BOARD_COPY.company.trayTitle;

      return (
        <>
          {line}
          {/* `truncate` stays as the backstop for a company name long enough to beat even a full
              line. It is a backstop and not the design: at 1280 the longest real name uses about
              two thirds of the width. */}
          <span className="truncate pl-3.5 text-helper text-ink-tertiary">{company}</span>
        </>
      );
    },
    [by, entityById, entitiesLoading],
  );

  const move = React.useCallback(
    async (outlet: Outlet, groupId: string | null) => {
      // A drop onto the card the outlet already sits in is not an edit. Silent, not a toast:
      // nothing happened, and saying so would be noise on every mis-aimed drag.
      if (groupIdOf(outlet, copy.field) === groupId) return;

      const destination = groupId
        ? (groupById.get(groupId)?.name ?? copy.unknownTarget)
        : copy.trayTitle;

      setSaving((prev) => new Set(prev).add(outlet.id));
      try {
        await update(outlet.id, patchFor(copy.field, groupId));
        // Both ends named, because a drag that lands one card off is the mistake this is
        // guarding against and "Saved" would not reveal it.
        toast.success(`${outlet.name} → ${destination}`);
      } catch (error) {
        // The chip never moved: the board only re-renders from the API's answer, so a failure
        // leaves the record exactly where it was and the message says why.
        toast.error(`${outlet.name} was not moved`, { description: failureMessage(error) });
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(outlet.id);
          return next;
        });
      }
    },
    [update, groupById, copy],
  );

  const sensors = useSensors(
    // A short distance threshold so a click on the handle is not a one-pixel drag. The handle
    // does nothing else, but a drag that fires on mousedown feels broken.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const announcements = React.useMemo<Announcements>(() => {
    const outletName = (id: string) => byId.get(id)?.name ?? "outlet";
    const targetName = (id: string) => {
      const groupId = targetGroupId(id, copy.prefix);
      if (groupId === undefined) return "nothing";
      if (groupId === null) return copy.trayTitle;
      return groupById.get(groupId)?.name ?? copy.unknownTarget;
    };

    // Real sentences, not dnd-kit's defaults: the default says "draggable item 3 was moved over
    // droppable area 7", which is the id vocabulary rather than the user's. Each board has its
    // own four, written out in `BOARD_COPY` rather than templated — see the note there.
    return {
      onDragStart: ({ active }) => copy.announce.start(outletName(String(active.id))),
      onDragOver: ({ active, over }) =>
        over
          ? copy.announce.over(outletName(String(active.id)), targetName(String(over.id)))
          : copy.announce.overNothing(outletName(String(active.id))),
      onDragEnd: ({ active, over }) =>
        over
          ? copy.announce.end(outletName(String(active.id)), targetName(String(over.id)))
          : copy.announce.endNothing(outletName(String(active.id))),
      onDragCancel: ({ active }) => copy.announce.cancel(outletName(String(active.id))),
    };
  }, [byId, groupById, copy]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const outlet = byId.get(String(event.active.id));
    const groupId = targetGroupId(event.over ? String(event.over.id) : undefined, copy.prefix);
    // `undefined` is "dropped on nothing" and is a no-op, not an un-link.
    if (!outlet || groupId === undefined) return;
    void move(outlet, groupId);
  }

  const active = activeId ? byId.get(activeId) : undefined;

  // The brand board reads three indexes and the company board two — so a brands request that
  // fails must not take down a board that never needed it. The entity index is required by both:
  // the company board draws its cards from it, and the brand board names the company on every
  // chip.
  const groupsTruncated = by === "brand" ? brandsTruncated : entitiesTruncated;
  const isLoading = outletsLoading || entitiesLoading || (by === "brand" && brandsLoading);
  const error = outletsError ?? entitiesError ?? (by === "brand" ? brandsError : undefined);

  // "outlets", the board's own cards, or both — one sentence that stays true in all three cases,
  // rather than three that drift apart the next time one is edited. Only the lists *this* board
  // draws from are named: a truncated brand index does not thin the company board, and claiming
  // it did would be a false alarm on a banner whose whole value is that it is never noise.
  const truncatedLists = [hasMore ? "outlets" : null, groupsTruncated ? copy.truncationTerm : null]
    .filter(Boolean)
    .join(" and ");

  return (
    <>
      {/* Outside every state below, so the switch is reachable while the other board is still
          loading and survives an error on it. `pt-4`: `PageHeader` ends on `pb-2`, which is
          enough under a table card but not under a control. */}
      <div className="px-6 pt-4 pb-4 md:px-8">
        {/* A view control, not a filter: it changes what the page is a picture of rather than
            narrowing it, and `AGENTS.md` is explicit that the two must not look alike. There is
            no filter row here for it to be mistaken for, but a `Select` would still hide half
            the answer behind a click. */}
        <SegmentedControl
          label="How to group the outlets"
          value={by}
          options={[
            { value: "company", label: BOARD_COPY.company.switchLabel },
            { value: "brand", label: BOARD_COPY.brand.switchLabel },
          ]}
          // The default is written as an absent key rather than `?by=company`, so the plain URL
          // and the company board are the same link — and `useQueryFilters` drops empty values
          // for exactly this reason.
          onChange={(value) => setFilter("by", value === "brand" ? "brand" : undefined)}
        />
      </div>

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : error ? (
        // Either failure leaves the board unable to say anything true about the group, so both
        // surface — a card list that loaded against outlets that did not is a map of nothing.
        <QueryError error={error} />
      ) : groups.length === 0 && outlets.length === 0 ? (
        <EmptyState message={copy.emptyMessage} hint={copy.emptyHint} />
      ) : (
        <BoardContext.Provider value={{ copy, groups, saving, move, activeId, subLabel }}>
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            accessibility={{
              announcements,
              screenReaderInstructions: { draggable: copy.instructions },
            }}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="flex flex-col gap-8 px-6 pb-8 md:px-8">
              {truncatedLists ? (
                // Never fake a total: a walk stopped at its page cap, so what follows is a floor.
                // Loud, because a board that silently drops rows is worse than one that admits
                // it. Both lists are named, because they fail differently: missing outlets thin
                // the cards, missing *cards* take their outlets off the board entirely.
                <p
                  role="alert"
                  className="rounded-xl bg-warning-tint px-4 py-3 text-helper text-warning"
                >
                  More {truncatedLists} exist than could be loaded, so this board is incomplete.
                  Every count below is a floor, not a total.
                </p>
              ) : null}

              <UnassignedTray
                outlets={ungrouped}
                truncated={hasMore}
                estateEmpty={outlets.length === 0}
              />

              {orphaned.length > 0 ? <MissingGroupSection outlets={orphaned} /> : null}

              <section className="flex flex-col gap-3">
                <SectionHeading title={copy.sectionTitle} description={copy.sectionDescription} />
                {/* `items-start` is load-bearing, not tidying. A grid stretches its cells to the
                    tallest in the row by default, so the five-chip Casa Vostra card made its
                    neighbours tall and three-quarters empty — which reads as "room for more
                    outlets here" rather than as a row height. Found by rendering the page. */}
                <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {groups.map((group) => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      outlets={byGroupId.get(group.id) ?? []}
                    />
                  ))}
                </div>
              </section>
            </div>

            {/* The lifted chip rides the cursor while the **source stays exactly where it was**.
                That is the "nothing is optimistic" rule made visible: the record has not moved
                until the API says so, and an overlay that left a hole behind it would be claiming
                it had. */}
            <DragOverlay dropAnimation={null}>
              {active ? (
                <ChipBody outlet={active} subLabel={subLabel(active)} className="shadow-e1" />
              ) : null}
            </DragOverlay>
          </DndContext>
        </BoardContext.Provider>
      )}
    </>
  );
}

function failureMessage(error: unknown) {
  // The server's own words. A domain refusal names what is in the way, which is more useful than
  // anything this component could invent — the same reasoning as `ConfirmDialog` on the entities
  // table. Only a fetch that never reached the API gets a message from here.
  if (error instanceof ApiError) return error.message;
  return "The request did not complete. Check that the API is reachable and try again.";
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-h2 text-ink">{title}</h2>
      <p className="max-w-[72ch] text-helper text-ink-secondary">{description}</p>
    </div>
  );
}

/**
 * Outlets with nothing set on this board's dimension, and the drop target that clears one.
 *
 * Both nulls are considered rather than missing — an outlet with no holding entity is a decision
 * outstanding, an outlet with no brand is a one-off site — so both get a named tray at the top of
 * the page rather than being scattered or hidden.
 *
 * Dashed border rather than solid: it reads as a place things go, which is exactly what it is.
 */
function UnassignedTray({
  outlets,
  truncated,
  estateEmpty,
}: {
  outlets: Outlet[];
  truncated: boolean;
  estateEmpty: boolean;
}) {
  const { copy } = useBoard();
  const { setNodeRef, isOver } = useDroppable({ id: TRAY_DROPPABLE });
  const sorted = [...outlets].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title={copy.trayTitle} description={copy.trayDescription} />
      <div
        ref={setNodeRef}
        className={cn(
          "rounded-xl border border-dashed border-border bg-card p-4 transition-colors",
          isOver && "border-brand bg-surface-selected",
        )}
      >
        {sorted.length === 0 ? (
          <p className="px-1 py-2 text-sm text-ink-secondary">
            {/* "Every outlet" is a claim about the whole estate, and the truncated board has not
                seen the whole estate — the two states rendered together read as a contradiction,
                which is how the wording got caught. Same rule as the footers: say what was
                actually looked at. `estateEmpty` is the third case: with no outlets at all,
                "every outlet has a holding entity" is vacuously true and reads as reassurance
                about an estate that is not there. */}
            {estateEmpty
              ? copy.trayEmptyEstate
              : truncated
                ? copy.trayEmptyTruncated
                : copy.trayEmptyAll}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((outlet) => (
              <li key={outlet.id}>
                <OutletChip outlet={outlet} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Outlets whose card is not among the loaded ones.
 *
 * **This should be unreachable, and is rendered anyway.** Every index walks to exhaustion, and
 * both `entity_id` and `brand_id` are RESTRICT on delete, so neither a company holding outlets
 * nor a brand carried by one can vanish from under them. But the failure it guards is the one
 * thing this board must never do: an outlet naming an absent card appears in no card and not in
 * the tray either, so without this section it is simply *not on the map* — and the reader's
 * conclusion from an absent row is that the outlet does not exist, not that the page ran out of
 * pages.
 *
 * Not a droppable — there is no card here to drop *onto* — but the chips themselves are fully
 * live, by drag and by menu, and that is the repair: move the outlet to a card that is shown, or
 * to the tray, and the section empties itself.
 */
function MissingGroupSection({ outlets }: { outlets: Outlet[] }) {
  const { copy } = useBoard();
  const sorted = [...outlets].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title={copy.missingTitle} description={copy.missingDescription} />
      {/* **No `role="alert"` here**, though the warning styling invites it. `alert` is an
          assertive live region meant for a short message; wrapping a list of drag handles and
          menus in one means every in-flight save inside it interrupts the user. The heading above
          carries the message and sits in the heading order, which is the discoverable route. */}
      <div className="rounded-xl border border-warning bg-warning-tint p-4">
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((outlet) => (
            <li key={outlet.id}>
              <OutletChip outlet={outlet} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function GroupCard({ group, outlets }: { group: BoardGroup; outlets: Outlet[] }) {
  const { copy } = useBoard();
  const { setNodeRef, isOver } = useDroppable({ id: cardDroppable(copy.prefix, group.id) });

  // Dormant, struck-off, closed and retired cards stay drop targets — the API allows the write,
  // and refusing it here would invent a rule the domain does not have. They are muted rather than
  // hidden, and the status badge says which, so the muting is a second cue and never the only one.
  const sorted = [...outlets].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Card
      ref={setNodeRef}
      size="sm"
      className={cn(
        "transition-colors",
        group.muted && "bg-surface-sunken",
        isOver && "border-brand bg-surface-selected",
      )}
    >
      <CardHeader>
        <CardTitle>
          <Link
            href={group.href}
            className={cn(
              "rounded-md hover:text-brand hover:underline",
              group.muted ? "text-ink-secondary" : "text-ink",
            )}
          >
            {group.name}
          </Link>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={group.statusTone}>{group.statusLabel}</Badge>
          {group.meta}
          {/* The chips actually drawn, not a server aggregate. A count that disagrees with the
              list under it is the defect the brand detail page shipped and read back in Stage 3,
              and on a truncated board the drawn count is the only one that stays true. */}
          <span className="ml-auto text-helper text-ink-tertiary">
            {sorted.length} {sorted.length === 1 ? "outlet" : "outlets"}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        {sorted.length === 0 ? (
          // "No outlets", not an empty card: a company holding nothing — or a brand over no door
          // yet — is a fact about the group, and a blank space reads as a rendering failure. It is
          // also still a drop target.
          <p className="text-helper text-ink-tertiary">No outlets</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((outlet) => (
              <li key={outlet.id}>
                <OutletChip outlet={outlet} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The status dot's colour, taken from the same `OUTLET_STATUS_TONES` vocabulary the badges use —
 * so a pipeline outlet is the same blue here as its badge on the outlets table. Written out as
 * literal class names because **Tailwind scans for literal strings**: `bg-${tone}` compiles to a
 * dot with no colour, which is the trap `group-rail.ts` documents for the contracts table.
 */
const STATUS_DOT: Record<BadgeTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
  default: "bg-ink-tertiary",
  outline: "bg-ink-tertiary",
};

/**
 * One outlet on the board: a drag handle, a link to the record, and a menu.
 *
 * **Three controls rather than one draggable link, and the split is forced.** `useDraggable`'s
 * attributes put `role="button"` and a space/enter activator on whatever they are spread onto —
 * on an `<a>` that is a link announcing itself as a button, whose Enter key would have to serve
 * both navigation and lifting. So the drag lives on its own handle, the name stays a plain link,
 * and the menu is a third control.
 *
 * The status appears **as a word as well as a dot**, on both boards. Colour is never the only
 * carrier of a state here (§3.3 / WCAG 1.4.1), and a legend mapping five colours to five statuses
 * is a legend nobody reads — so the dot is a fast scan cue sitting on top of text that already
 * says it. See `subLabel` for why the brand board adds the company as a third term instead of
 * taking the status word's place.
 */
function OutletChip({ outlet }: { outlet: Outlet }) {
  const { saving, activeId, subLabel } = useBoard();
  const isSaving = saving.has(outlet.id);
  const isActive = activeId === outlet.id;

  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: outlet.id,
    disabled: isSaving,
  });

  return (
    <ChipBody
      ref={setNodeRef}
      outlet={outlet}
      subLabel={subLabel(outlet)}
      // The source dims but does not move or collapse — the row keeps its place until the API
      // answers. `isDragging` covers the pointer path, `isActive` the keyboard one.
      className={cn((isDragging || isActive) && "opacity-40")}
      handle={
        isSaving ? (
          <span
            role="status"
            // `size-9` is `Button size="icon-sm"`, which is what this replaces. At `size-7` the
            // chip's contents jumped 8px left the instant a move started — a wobble on exactly
            // the frame the user is watching to see whether their drag worked.
            className="flex size-9 shrink-0 items-center justify-center text-ink-tertiary"
          >
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
            <span className="sr-only">Moving {outlet.name}</span>
          </span>
        ) : (
          <Button
            ref={setActivatorNodeRef}
            variant="ghost"
            size="icon-sm"
            className="shrink-0 cursor-grab text-ink-tertiary active:cursor-grabbing"
            {...listeners}
            {...attributes}
          >
            <GripVerticalIcon />
            {/* **Not the menu's name.** These two buttons sit next to each other in every chip
                and do different things, so sharing an accessible name left a screen-reader user
                hearing "Move Kilo Lounge to another company, button" twice with nothing to choose
                between them. "Pick up" is also the verb the drag announcements already use on
                both boards ("Picked up Kilo Lounge"), so the control and the feedback speak the
                same vocabulary — which is why this one string needs no per-dimension wording. */}
            <span className="sr-only">Pick up {outlet.name}</span>
          </Button>
        )
      }
      action={<MoveMenu outlet={outlet} disabled={isSaving} />}
    />
  );
}

/**
 * The chip's markup, shared by the board and by `DragOverlay`.
 *
 * The overlay copy renders without a handle or a menu: it is a picture of the thing being moved,
 * and a second set of controls with the same accessible names would be announced twice. It does
 * carry the same sub-label, so the lifted chip is the same chip.
 */
const ChipBody = React.forwardRef<
  HTMLDivElement,
  {
    outlet: Outlet;
    subLabel: React.ReactNode;
    className?: string;
    handle?: React.ReactNode;
    action?: React.ReactNode;
  }
>(function ChipBody({ outlet, subLabel, className, handle, action }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-1 rounded-lg border border-border-subtle bg-surface py-1 pr-1 pl-1 transition-colors",
        className,
      )}
    >
      {/* The overlay copy renders no handle and no menu, but it must still occupy their width:
          both fallbacks are `size-9`, matching the `icon-sm` buttons they stand in for. Without
          them the lifted chip's contents sat 32px left of the source it is drawn over, so the
          text visibly jumped sideways at the moment of lift. */}
      {handle ?? <span aria-hidden className="size-9 shrink-0" />}
      <Link
        href={outletHref(outlet)}
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-1 py-1 hover:text-brand"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-4xl",
              STATUS_DOT[OUTLET_STATUS_TONES[outlet.status]],
            )}
          />
          <span className="truncate text-sm font-medium text-ink">{outlet.name}</span>
        </span>
        {subLabel}
      </Link>
      {action ?? <span aria-hidden className="size-9 shrink-0" />}
    </div>
  );
});

/**
 * The same move, without a pointer.
 *
 * §1 calls this the accessible fallback *and* the mobile story, and it is **not gated behind
 * hover** — dragging a chip between cards on a phone is misery, and a control that only appears
 * on hover does not exist on a touch screen at all.
 *
 * The card the outlet already sits in is disabled and ticked rather than hidden: a menu that
 * silently omits the current answer makes you check the card again to find out what it was.
 */
function MoveMenu({ outlet, disabled }: { outlet: Outlet; disabled: boolean }) {
  const { copy, groups, move } = useBoard();
  const current = groupIdOf(outlet, copy.field);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" className="shrink-0 text-ink-tertiary" />}
        disabled={disabled}
      >
        <MoreHorizontalIcon />
        <span className="sr-only">{copy.menuName(outlet.name)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {/* `DropdownMenuGroup` is not decoration. `DropdownMenuLabel` is Base UI's
            `Menu.GroupLabel`, which reads a context only `Menu.Group` provides — used bare it
            throws Base UI error #31 at the moment the menu opens, so the trigger renders, the
            click does nothing, and the console shows a numbered production error. Nothing in
            this repo had rendered `dropdown-menu.tsx` before, so this was found here first. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{copy.menuLabel}</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!current}
            onClick={() => move(outlet, null)}
            className="justify-between"
          >
            {copy.trayTitle}
            {current ? null : <CheckIcon />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {groups.map((group) => (
            <DropdownMenuItem
              key={group.id}
              disabled={group.id === current}
              onClick={() => move(outlet, group.id)}
              className="justify-between gap-2"
            >
              <span className="truncate">{group.name}</span>
              {group.id === current ? <CheckIcon /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
