import type {
  CreateMarketingRequestInput,
  MarketingRequest,
  MarketingRequestPriority,
  MarketingRequestStatus,
  MarketingRequestType,
  Outlet,
  UpdateMarketingRequestInput,
  WorkspacePerson,
} from "@brandfactory/shared";
import { MarketingRequestStatusSchema } from "@brandfactory/shared";

/**
 * The inbox's pure logic — what the URL means, what the search box matches, what the form
 * sends. Kept out of the components so it can be tested without rendering, which is the only
 * kind of test this package writes for a screen.
 */

/** The ladder, in order. The segmented control and both status selects read it. */
export const REQUEST_STATUSES: readonly MarketingRequestStatus[] = MarketingRequestStatusSchema.options;

/** "all" is the absence of a status filter, not a fifth status. */
export type StatusView = MarketingRequestStatus | "all";

/**
 * `?status=` read once. A value the enum does not have — an old link, a typo — reads as "all"
 * rather than as an empty table that no control on the page can explain.
 */
export function statusViewFrom(raw: string | undefined): StatusView {
  return (REQUEST_STATUSES as readonly string[]).includes(raw ?? "")
    ? (raw as MarketingRequestStatus)
    : "all";
}

/** `?mine=1`, read once. Only `1` is on — one reading of the URL for every consumer. */
export function mineFrom(raw: string | undefined): boolean {
  return raw === "1";
}

export function inStatus(row: MarketingRequest, view: StatusView): boolean {
  return view === "all" || row.status === view;
}

export function isMine(row: MarketingRequest, userId: string | undefined): boolean {
  return userId !== undefined && row.assignee?.id === userId;
}

/** Who a person is on screen: their name if they set one, else their email. */
export function personLabel(person: MarketingRequest["requestedBy"]): string {
  if (!person) return "Unknown";
  return person.displayName?.trim() || person.email;
}

/**
 * What the search box promises, and no more: the reference, the summary, the brand, the outlet
 * and who asked. Every one of those is on the table, so the highlight can mark why a row
 * matched. The details body is not searched — a row matching on a sentence nobody can see is a
 * row with no visible reason to be there.
 */
export function inSearch(
  row: MarketingRequest,
  q: string | undefined,
  names: { brand: string; outlet: string | undefined },
): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [row.reference, row.summary, names.brand, names.outlet, personLabel(row.requestedBy)].some(
    (field) => (field ?? "").toLowerCase().includes(needle),
  );
}

/** The unfiltered count per rung — the segmented control's own labels. */
export function tally(rows: readonly MarketingRequest[]): Record<MarketingRequestStatus, number> {
  const counts = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<
    MarketingRequestStatus,
    number
  >;
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/** The outlets a request for this brand may name, by name. Empty until a brand is chosen. */
export function outletsForBrand(outlets: readonly Outlet[], brandId: string): Outlet[] {
  if (!brandId) return [];
  return outlets
    .filter((o) => o.brandId === brandId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type RequestFormState = {
  brandId: string;
  outletId: string;
  type: MarketingRequestType | "";
  priority: MarketingRequestPriority;
  summary: string;
  details: string;
  neededBy: string;
};

export function initialRequestForm(defaultBrandId?: string): RequestFormState {
  return {
    brandId: defaultBrandId ?? "",
    outletId: "",
    type: "",
    priority: "medium",
    summary: "",
    details: "",
    neededBy: "",
  };
}

/** The first thing stopping a submit, in a sentence somebody can act on; `null` when none. */
export function requestFormProblem(form: RequestFormState): string | null {
  if (!form.brandId) return "Choose the brand this request is for.";
  if (!form.type) return "Choose what kind of request this is.";
  if (!form.summary.trim()) return "Write a one-line summary.";
  return null;
}

/**
 * The body the create route takes. A cleared box is `null`, never `""` — an empty string is
 * truthy, sorts first and is invisible on screen. Call only when `requestFormProblem` is `null`.
 */
export function toCreateInput(form: RequestFormState): CreateMarketingRequestInput {
  if (!form.type) throw new Error("toCreateInput needs a type");
  return {
    brandId: form.brandId as CreateMarketingRequestInput["brandId"],
    outletId: (form.outletId || null) as CreateMarketingRequestInput["outletId"],
    type: form.type,
    priority: form.priority,
    summary: form.summary.trim(),
    details: form.details.trim() || null,
    neededBy: form.neededBy || null,
  };
}

/** One row of the assignee menu. `id: null` is the Unassigned choice. */
export interface AssigneeOption {
  id: string | null;
  label: string;
  isMe: boolean;
}

/**
 * The assignee control's rows: `Unassigned` first, then everybody, the caller marked.
 *
 * **A native `<select>`, not a `DropdownMenu`.** The plan said menu, on the rule the influencer
 * roster follows — and that rule is about a *table cell*, where arrow keys on a closed select fire
 * one `change` per press and so one write per press. This control sits in a sheet, directly under
 * a Status control that is already a native select for the same closed enum, and `AGENTS.md`'s
 * package-level rule is the native control. A popup menu beside a native select, both picking one
 * value from a short list, would be two answers to one question on one panel.
 *
 * **`Unassigned` is a real item, not an empty row.** Clearing an assignment is a choice somebody
 * makes, and a menu whose first entry is blank reads as a rendering fault rather than an option.
 *
 * **The caller is marked rather than hoisted.** The list is ordered by the server in the order its
 * labels read, and moving one name to the top would break that for the one person most likely to
 * be looking for somebody else's. "Assign to me" is the fast path for taking it yourself and it is
 * still on the sheet.
 *
 * `personLabel` is reused for the label, so a person reads the same in this menu as in the
 * Assigned column and in "Requested by" — name if they set one, else their email.
 */
export function assigneeOptions(
  people: readonly WorkspacePerson[],
  meId: string | undefined,
): AssigneeOption[] {
  const rows: AssigneeOption[] = [{ id: null, label: "Unassigned", isMe: false }];
  for (const person of people) {
    const isMe = !!meId && person.id === meId;
    rows.push({
      id: person.id,
      label: isMe ? `${personLabel(person)} (you)` : personLabel(person),
      isMe,
    });
  }
  return rows;
}

/**
 * What the picker should send for a chosen row, or `null` when nothing changed.
 *
 * The patch schema refuses `{}` and an unchanged write would put back a value a colleague may
 * have just altered, so choosing the row that is already set closes the menu and sends nothing —
 * the rule `entry-form.ts` states for the calendar sheet, applied to one field.
 */
export function assigneePatch(
  request: MarketingRequest,
  chosen: NonNullable<UpdateMarketingRequestInput["assigneeUserId"]> | null,
): Pick<UpdateMarketingRequestInput, "assigneeUserId"> | null {
  const current = request.assignee?.id ?? null;
  if (current === chosen) return null;
  return { assigneeUserId: chosen };
}
