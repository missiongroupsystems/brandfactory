import type { Influencer, InfluencerAccount, InfluencerPlatform } from "@brandfactory/shared";
import { InfluencerAccountsSchema, MAX_INFLUENCER_ACCOUNTS } from "@brandfactory/shared";
import { INFLUENCER_PLATFORM_LABELS } from "@/lib/labels";

import { toNullableNumber } from "./format";

/**
 * One account as the **form** holds it, and the list operations over it.
 *
 * Everything here is pure and none of it renders — which is the point. `AGENTS.md` says this
 * package tests auth, workspace resolution and cache keys rather than screens, so the four rules
 * the account editor has to keep (a list that cannot empty, a cap, a reorder that means something,
 * and a duplicate caught before submit) live in a module that can be asserted directly.
 * `account-rows.tsx` is then a thin renderer over them.
 */

/**
 * **Numbers are strings while the form is open.**
 *
 * `Number("")` is `0`, so a draft holding numbers could not represent an empty box without it
 * meaning a follower count of nothing — and a creator silently entered on zero followers lands in
 * Nano and looks like a real reading. They convert once, in `toAccountPayload`.
 *
 * `url` is a string for the same reason one level down: `""` is a cleared box, and `null` is what
 * the wire wants in its place.
 */
export type AccountDraft = {
  platform: InfluencerPlatform;
  handle: string;
  followers: string;
  engagementRate: string;
  url: string;
};

export function emptyAccountDraft(): AccountDraft {
  return { platform: "instagram", handle: "", followers: "", engagementRate: "", url: "" };
}

/**
 * The creator's stored accounts as drafts, or one empty row for a new creator.
 *
 * **One row, not zero.** `InfluencerAccountsSchema` is `.min(1)`, so a form opening on an empty
 * list would ask somebody to press `Add account` before they could type anything — a step that
 * exists only because the draft started in a state the record cannot hold.
 */
export function accountDraftsFrom(influencer?: Influencer): AccountDraft[] {
  if (!influencer || influencer.accounts.length === 0) return [emptyAccountDraft()];
  return influencer.accounts.map((account) => ({
    platform: account.platform,
    handle: account.handle,
    followers: String(account.followers),
    engagementRate: account.engagementRate === null ? "" : String(account.engagementRate),
    url: account.url ?? "",
  }));
}

/** Append an empty row, up to the cap the schema enforces. At the cap the list comes back as it is. */
export function addAccountDraft(drafts: readonly AccountDraft[]): AccountDraft[] {
  if (drafts.length >= MAX_INFLUENCER_ACCOUNTS) return [...drafts];
  return [...drafts, emptyAccountDraft()];
}

/**
 * Drop one row — **unless it is the last one**.
 *
 * The guard is here rather than in the component so the rule holds for any caller: a list that
 * could reach zero would fail on submit against `.min(1)`, which is a refusal after the work
 * instead of a button that says why it is disabled.
 */
export function removeAccountDraft(drafts: readonly AccountDraft[], index: number): AccountDraft[] {
  if (drafts.length <= 1) return [...drafts];
  return drafts.filter((_, i) => i !== index);
}

/**
 * Move a row to position 0, keeping every other row's order.
 *
 * Position 0 **is** the primary account — there is no flag — so this is the whole of "make
 * primary". A swap with index 0 would reorder the list twice for one intent and send an unrelated
 * account down the page.
 */
export function makeAccountPrimary(drafts: readonly AccountDraft[], index: number): AccountDraft[] {
  const row = drafts[index];
  if (!row || index === 0) return [...drafts];
  return [row, ...drafts.filter((_, i) => i !== index)];
}

/** Replace one row. */
export function setAccountDraft(
  drafts: readonly AccountDraft[],
  index: number,
  patch: Partial<AccountDraft>,
): AccountDraft[] {
  return drafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft));
}

/**
 * The indexes of rows repeating a `(platform, handle)` pair already used above them.
 *
 * **The same rule the server refuses on, checked before the request.**
 * `InfluencerAccountsSchema` rejects a repeated pair, and a form that lets somebody fill three
 * fields and then reads them the refusal is a form that wastes their time. Only the *second*
 * occurrence is flagged: marking both would tell the reader that the row they typed first is also
 * wrong.
 *
 * Compared exactly, not case-folded, because
 * `influencer_accounts_workspace_platform_handle_key` compares exactly — flagging a pair the
 * database would accept is its own defect. Empty handles are skipped: a form with two untouched
 * rows is incomplete rather than contradictory, and `required` already says so.
 */
export function duplicateAccountIndexes(drafts: readonly AccountDraft[]): ReadonlySet<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  drafts.forEach((draft, index) => {
    const handle = draft.handle.trim();
    if (!handle) return;
    const key = `${draft.platform} ${handle}`;
    if (seen.has(key)) duplicates.add(index);
    seen.add(key);
  });
  return duplicates;
}

/**
 * The drafts as the wire wants them: numbers converted once, empty boxes as `null`.
 *
 * `toNullableNumber` is what keeps a typed `0` apart from an untouched box — a creator measured at
 * zero engagement has a very bad one, and a prospect nobody has run a campaign with has none.
 *
 * **An empty follower box converts to `NaN`, and the emptiness is tested before the conversion
 * rather than after it.** `Number("")` is `0`, not `NaN` — so `Number(draft.followers)` alone
 * would launder an untouched box into a creator entered on zero followers, who lands in Nano and
 * looks like a real reading. That is the precise failure the string-valued draft exists to
 * prevent, and it would have been reintroduced at the one point the draft stops being a draft.
 *
 * Three things refuse it and the order matters: the input is `required`, so the browser stops the
 * submit; this line answers `NaN` if one ever gets past it; and `InfluencerFollowersSchema` is
 * `z.number()`, which rejects `NaN` — so the body is refused with the field named rather than
 * written with a figure nobody typed.
 */
export function toAccountPayload(drafts: readonly AccountDraft[]): InfluencerAccount[] {
  return drafts.map((draft) => ({
    platform: draft.platform,
    handle: draft.handle.trim(),
    followers: draft.followers.trim() === "" ? Number.NaN : Number(draft.followers),
    engagementRate: toNullableNumber(draft.engagementRate),
    url: draft.url.trim() === "" ? null : draft.url.trim(),
  }));
}

/**
 * Why one row's two **figure** boxes cannot be read, or `null` when both can.
 *
 * ── Why this is not left to the schema ────────────────────────────────────
 *
 * The panel's boxes are plain text until {@link toAccountPayload} converts them, and the two
 * conversions fail in **opposite** ways. A follower count that is not a number becomes `NaN`,
 * which `InfluencerFollowersSchema` refuses — with *"Invalid input: expected number, received
 * NaN"*, which is the shape of sentence {@link accountsProblem} exists to keep off the screen. An
 * engagement rate that is not a number becomes `null` through `toNullableNumber`, and `null` is a
 * **legal value** on this field: it means nobody has measured this account. So the schema passes
 * it, `Save` stays enabled, and a rate somebody recorded is replaced by "not measured" without a
 * word on screen.
 *
 * That second case is the reason this function exists. It is the same laundering
 * {@link toAccountPayload} documents for `Number("") === 0`, one field over, and the guard that
 * catches it there — a value the schema refuses — cannot fire here, because the laundered value is
 * one the schema wants.
 *
 * The four inputs a person actually produces, in the order they are answered: a follower count
 * carrying a thousands separator (`412,000`) or a decimal point, a negative one, a rate carrying
 * its own percent sign (`3.2%`), and a rate entered as a whole audience share rather than a
 * percent (`320`).
 *
 * **An empty box is not this function's refusal.** `followers` empty is
 * {@link accountsProblem}'s own sentence one step up, and `engagementRate` empty is the whole
 * point of a nullable column.
 */
export function figureProblem(draft: AccountDraft): string | null {
  const followers = draft.followers.trim()
  if (followers !== "") {
    const count = Number(followers)
    // `Number.isInteger` answers `false` for `NaN` as well, so one test covers a word, a comma and
    // a decimal point. `84.5` is a real mistake here: the column is an integer.
    if (!Number.isInteger(count))
      return "Every follower count must be a whole number. Enter 412000 rather than 412,000.";
    if (count < 0) return "A follower count cannot be negative.";
  }

  const rate = draft.engagementRate.trim();
  if (rate === "") return null;
  const engagement = Number(rate);
  if (!Number.isFinite(engagement))
    return "An engagement rate must be a number. Enter 3.2 for 3.2%, or leave the box empty.";
  if (engagement < 0 || engagement > 100)
    return "An engagement rate is a percent, so it must be between 0 and 100.";
  return null;
}

/**
 * Why this list cannot be saved yet, in one sentence, or `null` when it can.
 *
 * **Composed out of the rules above rather than a fifth opinion about them.** The duplicate set is
 * {@link duplicateAccountIndexes}', the payload is {@link toAccountPayload}'s and the verdict is
 * `InfluencerAccountsSchema`'s — the same zod object the route validates with. What this adds is
 * the *order* the reasons are given in and the words two of them are given in.
 *
 * It exists because the accounts panel has no `<form>` to lean on. `InfluencerForm` marks its
 * boxes `required` and `type="number"` and lets the browser refuse the submit; a panel that lives in
 * a popover over a table cell has to disable its own `Save` and say why, and "Too small: expected
 * string to have >=1 characters" is not a sentence anybody can act on. So the failures a person
 * actually produces — an empty box, a pair they already typed, and a figure that is not one — are
 * worded here, and everything else falls through to the schema's own message, which is written for
 * exactly the cases nobody produces by hand.
 *
 * The order is deliberate: the **duplicate first**, because it is the one failure whose fix is to
 * delete a row rather than to fill one in, and reporting an empty box on the row somebody is about
 * to remove sends them to the wrong end of the panel.
 */
export function accountsProblem(drafts: readonly AccountDraft[]): string | null {
  const duplicates = duplicateAccountIndexes(drafts);
  const firstDuplicate = [...duplicates][0];
  if (firstDuplicate !== undefined) {
    const draft = drafts[firstDuplicate]!;
    return `@${draft.handle.trim()} on ${INFLUENCER_PLATFORM_LABELS[draft.platform]} is already listed above — one account per platform and handle.`;
  }

  if (drafts.some((draft) => draft.handle.trim() === "")) return "Every account needs a handle.";
  // Tested on the string, before the conversion: `Number("")` is `0`, which would launder an
  // untouched box into a creator entered on zero followers. The same trap `toAccountPayload`
  // documents, at the one point a person can still see the box.
  if (drafts.some((draft) => draft.followers.trim() === ""))
    return "Every account needs a follower count.";

  // The two figure boxes, before the schema sees them. One of the two cases {@link figureProblem}
  // answers is a **silent** one — an unreadable engagement rate converts to `null`, which is a
  // value the schema accepts and which erases a measurement nobody meant to clear.
  for (const draft of drafts) {
    const figure = figureProblem(draft);
    if (figure) return figure;
  }

  const parsed = InfluencerAccountsSchema.safeParse(toAccountPayload(drafts));
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Those accounts cannot be saved.");
}
