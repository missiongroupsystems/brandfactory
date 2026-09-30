import type {
  CreateSocialPostInput,
  SocialPlatform,
  SocialPost,
  SocialPostKind,
  SocialPostStatus,
  UpdateSocialPostInput,
} from "@brandfactory/shared";
import { localDayKey } from "@brandfactory/shared";

/**
 * The entry sheet's draft, and the two payloads it turns into.
 *
 * **A file, not a component, for the same reason as `grid.ts`:** a time that is an hour out or a
 * patch that quietly clears a colleague's hook looks completely normal on screen. The person who
 * notices is the one whose shoot moved, so the arithmetic is where the tests are.
 */

/** Every field as the inputs hold it — strings, with `""` meaning blank. */
export interface EntryFormState {
  brandId: string;
  kind: SocialPostKind;
  platform: SocialPlatform;
  /** `YYYY-MM-DD`, local. Required: `/calendar` reads scheduled rows only. */
  date: string;
  /** `HH:MM`, local. */
  time: string;
  status: SocialPostStatus;
  format: string;
  hook: string;
  dish: string;
  talent: string;
  filmedBy: string;
  clearedWith: string;
  canvaUrl: string;
  body: string;
  /** The shoot this post comes from, or `""`. Always `""` on a shoot. */
  shootId: string;
  /** The Mission Events booking this entry is for, or `""`. */
  eventsEventId: string;
  /** Library asset ids, in order. A full replacement on save, as the route takes it. */
  assetIds: string[];
}

/**
 * The time a new entry starts at. A slot needs a timestamp to sit on the grid, and midnight would
 * print `00:00` on every chip as if somebody had chosen it.
 */
export const DEFAULT_ENTRY_TIME = "10:00";

const PLAN_KEYS = [
  "format",
  "hook",
  "dish",
  "talent",
  "filmedBy",
  "clearedWith",
  "canvaUrl",
] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local `HH:MM` of an ISO timestamp, or `""` when it will not parse. */
export function localTimeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A local date and time, as the ISO instant the server stores.
 *
 * Built from parts rather than `new Date("YYYY-MM-DDTHH:MM")`, which every engine reads as local
 * today but the spec only settled on recently — a parse that silently became UTC would move every
 * post eight hours in Singapore. `null` when the date is blank or the parts do not make a real day.
 */
export function scheduledAtFrom(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!d) return null;
  const t = /^(\d{1,2}):(\d{2})$/.exec((time.trim() || DEFAULT_ENTRY_TIME).trim());
  if (!t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]) - 1, Number(d[3])];
  const at = new Date(year, month, day, Number(t[1]), Number(t[2]));
  // `new Date(2026, 1, 31)` is 3 March. A date input cannot produce that, but a pasted value can,
  // and a post that lands on a day nobody typed is the failure this file exists to prevent.
  if (at.getFullYear() !== year || at.getMonth() !== month || at.getDate() !== day) return null;
  return at.toISOString();
}

/** The draft for a new entry, or for editing an existing one. */
export function initialEntryForm(
  entry?: SocialPost,
  defaults: { brandId?: string; date?: string } = {},
): EntryFormState {
  if (entry) {
    const at = entry.scheduledAt ? new Date(entry.scheduledAt) : null;
    const valid = at && !Number.isNaN(at.getTime());
    return {
      brandId: entry.brandId,
      kind: entry.kind,
      platform: entry.platform,
      date: valid ? localDayKey(at) : "",
      time: valid ? localTimeOf(entry.scheduledAt!) : DEFAULT_ENTRY_TIME,
      status: entry.status,
      format: entry.format ?? "",
      hook: entry.hook ?? "",
      dish: entry.dish ?? "",
      talent: entry.talent ?? "",
      filmedBy: entry.filmedBy ?? "",
      clearedWith: entry.clearedWith ?? "",
      canvaUrl: entry.canvaUrl ?? "",
      body: entry.body,
      shootId: entry.shootId ?? "",
      eventsEventId: entry.eventsEventId ?? "",
      assetIds: [...entry.assetIds],
    };
  }
  return {
    brandId: defaults.brandId ?? "",
    kind: "post",
    platform: "instagram",
    date: defaults.date ?? "",
    time: DEFAULT_ENTRY_TIME,
    status: "idea",
    format: "",
    hook: "",
    dish: "",
    talent: "",
    filmedBy: "",
    clearedWith: "",
    canvaUrl: "",
    body: "",
    shootId: "",
    eventsEventId: "",
    assetIds: [],
  };
}

/** Blank is `null`: the plan fields have one way to say "not written", not two. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Why the draft cannot be sent yet, or `null` when it can. Shown in the sheet, not thrown. */
export function entryFormProblem(form: EntryFormState): string | null {
  if (!form.brandId) return "Choose a brand.";
  if (!form.date.trim()) return "Choose a date — the calendar shows dated entries only.";
  if (scheduledAtFrom(form.date, form.time) === null) return "That date or time is not valid.";
  return null;
}

/**
 * The create body. The brand travels in the path, so it is not in here.
 *
 * `createdBy` is stated rather than left to the schema default: this sheet is a person typing,
 * and saying so at the call site is cheaper than a reader tracing the default.
 */
export function toCreateInput(form: EntryFormState): CreateSocialPostInput {
  const scheduledAt = scheduledAtFrom(form.date, form.time);
  if (scheduledAt === null) throw new Error(entryFormProblem(form) ?? "Invalid date");
  return {
    kind: form.kind,
    platform: form.platform,
    scheduledAt,
    status: form.status,
    body: form.body.trim(),
    createdBy: "user",
    format: blankToNull(form.format),
    hook: blankToNull(form.hook),
    dish: blankToNull(form.dish),
    talent: blankToNull(form.talent),
    filmedBy: blankToNull(form.filmedBy),
    clearedWith: blankToNull(form.clearedWith),
    canvaUrl: blankToNull(form.canvaUrl),
    // A shoot does not come from a shoot; the server refuses it, so the draft
    // never sends it rather than relying on the sheet having hidden the field.
    // The picker offers only ids the server returned, so the brand is a fact
    // about where the string came from; the server checks it again anyway.
    shootId: form.kind === "shoot" ? null : (blankToNull(form.shootId) as SocialPost["shootId"]),
    eventsEventId: blankToNull(form.eventsEventId),
    assetIds: form.assetIds as CreateSocialPostInput["assetIds"],
  };
}

/**
 * The patch: **only the keys that changed**, or `null` when nothing did.
 *
 * Two people edit the same month. A patch that re-sent every field would put back the hook a
 * colleague rewrote a minute ago, from a sheet that only meant to move the time. And the patch
 * schema refuses `{}`, so "nothing changed" has to be a `null` the caller skips, not a request.
 *
 * `brandId` and `kind` are never in it — the route cannot move a post between brands, and a shoot
 * does not become a post.
 */
export function toUpdateInput(
  entry: SocialPost,
  form: EntryFormState,
): UpdateSocialPostInput | null {
  const patch: Record<string, unknown> = {};

  const scheduledAt = scheduledAtFrom(form.date, form.time);
  if (scheduledAt === null) throw new Error(entryFormProblem(form) ?? "Invalid date");
  // Compared as instants, not strings: the server may echo `…00.000Z` for a value sent as `…00Z`.
  if (!entry.scheduledAt || Date.parse(entry.scheduledAt) !== Date.parse(scheduledAt)) {
    patch.scheduledAt = scheduledAt;
  }

  if (form.platform !== entry.platform) patch.platform = form.platform;
  if (form.status !== entry.status) patch.status = form.status;
  const body = form.body.trim();
  if (body !== entry.body.trim()) patch.body = body;

  for (const key of PLAN_KEYS) {
    const next = blankToNull(form[key]);
    if (next !== (entry[key] ?? null)) patch[key] = next;
  }

  if (entry.kind === "post") {
    const shootId = blankToNull(form.shootId);
    if (shootId !== entry.shootId) patch.shootId = shootId;
  }
  const eventsEventId = blankToNull(form.eventsEventId);
  if (eventsEventId !== entry.eventsEventId) patch.eventsEventId = eventsEventId;

  // Order is part of the value: a reordered list is a change, and the route
  // replaces the whole list, so it is sent whole or not at all.
  const sameAssets =
    form.assetIds.length === entry.assetIds.length &&
    form.assetIds.every((id, i) => id === entry.assetIds[i]);
  if (!sameAssets) patch.assetIds = [...form.assetIds];

  return Object.keys(patch).length > 0 ? (patch as UpdateSocialPostInput) : null;
}
