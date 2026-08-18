import type { Influencer, InfluencerAccount, InfluencerPlatform } from "@brandfactory/shared";
import { MAX_INFLUENCER_ACCOUNTS } from "@brandfactory/shared";

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
