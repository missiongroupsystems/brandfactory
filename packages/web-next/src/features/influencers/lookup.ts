import type {
  CreateInfluencerInput,
  Influencer,
  InfluencerVertical,
  LookupDraft,
  LookupFound,
  LookupInfluencerResult,
  LookupPlatform,
  ResearchSource,
} from "@brandfactory/shared";
import { InfluencerHandleSchema } from "@brandfactory/shared";

import type { AccountDraft } from "./account-drafts";

// ---------------------------------------------------------------------------
// Quick add's pure half — the free duplicate check and the draft→form mapping
// ---------------------------------------------------------------------------
//
// Everything in this file is a function over data, because everything else in
// quick add is a sheet somebody has to look at. The two things worth asserting
// are here: **who already holds this handle**, which decides whether a call is
// made at all, and **what a model's draft becomes in a form**, which decides
// what gets written.

/**
 * Is this `(platform, handle)` already on the roster, and who holds it?
 *
 * **Checked in memory, before any request is sent.** `useInfluencers` holds the
 * *whole* roster — that is what the exhaustive endpoint this screen is built on
 * buys — so this costs nothing and saves a paid lookup on the most ordinary
 * mistake there is: entering somebody who is already on the list.
 *
 * It is also 1.40.1's 409 turned into a sentence nobody has to read. That
 * release records the cost of finding out the other way: the form's most
 * ordinary mistake answered `Internal Server Error` until a mapping existed, and
 * even with the mapping the reader learns it *after* waiting out a model call.
 *
 * **Compared case-insensitively, and that is deliberately looser than the
 * database.** The unique index is exact, so `Priyaskin` and `priyaskin` really
 * are two rows the server would accept. This check refusing both is the right
 * asymmetry: a false positive costs one sentence naming a creator the reader can
 * go and look at, and a false negative costs a paid call and a duplicate that
 * reads as one person entered twice.
 *
 * Searches **every account of every creator**, not just the primary. A creator's
 * second Instagram is still their handle, and the unique index covers it.
 */
export function findHandleHolder(
  influencers: readonly Influencer[],
  platform: LookupPlatform,
  handle: string,
): Influencer | null {
  const wanted = handle.trim().toLowerCase();
  if (wanted === "") return null;
  return (
    influencers.find((influencer) =>
      influencer.accounts.some(
        (account) =>
          account.platform === platform && account.handle.trim().toLowerCase() === wanted,
      ),
    ) ?? null
  );
}

/**
 * Is this handle one the record could hold?
 *
 * `InfluencerHandleSchema`'s own message, never a rewritten one — and **a leading
 * `@` is refused rather than stripped**, which is the schema's decision and its
 * docstring's reason: stripping admits two spellings of one handle into a table
 * whose unique key treats them as different, and into the check above, which is
 * a string comparison.
 *
 * Returns `null` when the handle is fine, so a caller reads it as an error.
 */
export function handleError(handle: string): string | null {
  const parsed = InfluencerHandleSchema.safeParse(handle);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Enter a handle");
}

/**
 * What the review step edits.
 *
 * **`followers` is a string**, and this is `AccountDraft`'s rule for
 * `AccountDraft`'s reason: `Number("")` is `0`, so a numeric draft would launder
 * a box the model left empty and the person never filled into a creator entered
 * on zero followers — who lands in Nano and looks like a real reading. It is
 * converted once, in `toCreateInput`, where the emptiness is tested *before* the
 * conversion.
 *
 * `platform` and `handle` are carried even though the person typed them, because
 * this object is the whole of what `Add creator` writes and a payload assembled
 * from two places is a payload with two chances to disagree.
 */
export type QuickAddDraft = {
  platform: LookupPlatform;
  handle: string;
  name: string;
  followers: string;
  /** `""` is the generalist — the same empty option the full form uses. */
  vertical: InfluencerVertical | "";
  /** The profile URL. `""` is a cleared box; the wire wants `null`. */
  url: string;
};

/** What was found, and where. Rendered beside each field; never written. */
export type QuickAddEvidence = {
  found: LookupFound;
  /** The page the follower count was read from, when there was one. */
  followersSource: string | null;
  /**
   * **Every page the search layer actually fetched**, which is a different list
   * from the one page a figure was read off.
   *
   * It is here because it is the only thing on this screen a model cannot write.
   * `LookupInfluencerResult.sources` comes from the provider's retrieval log, and the
   * review step's whole job is to let somebody judge an answer — which they cannot do
   * from a name and a number alone. An empty list is the loudest signal there is: it
   * means nothing was read, and therefore that nothing below it was verified.
   */
  sources: readonly ResearchSource[];
};

/**
 * A lookup result as a form.
 *
 * **The platform and the handle come from what the person typed, not from the
 * draft.** The engine already refuses an account that is not the one asked for,
 * so the two agree today — and if they ever stop agreeing, the field the person
 * filled in is the one to believe. It also means an `outcome` of `not-found`
 * still produces a usable draft, which is what `Add manually` hands to the full
 * form: nothing typed is lost.
 *
 * **Nothing is zero-filled.** A follower count the lookup did not find arrives as
 * `""` — a visibly empty box somebody fills in — rather than as a `0` somebody
 * accepts. That is the whole review step in one line.
 */
export function quickAddDraftFrom(
  platform: LookupPlatform,
  handle: string,
  result?: Pick<LookupInfluencerResult, "draft"> | undefined,
): QuickAddDraft {
  const draft: LookupDraft | null = result?.draft ?? null;
  const account = draft?.accounts[0];
  return {
    platform,
    handle: handle.trim(),
    name: draft?.name ?? "",
    followers: account?.followers === null || account?.followers === undefined
      ? ""
      : String(account.followers),
    vertical: draft?.vertical ?? "",
    url: account?.url ?? "",
  };
}

/** The evidence panel's input, pulled out of the result the same way. */
export function quickAddEvidenceFrom(result: LookupInfluencerResult): QuickAddEvidence {
  return {
    found: result.found,
    followersSource: result.draft?.accounts[0]?.sourceUrl ?? null,
    sources: result.sources,
  };
}

/**
 * The draft as the ordinary create body.
 *
 * **Quick add invents no write path.** This produces `CreateInfluencerInput` and
 * nothing else, so every rule `POST /workspaces/:id/influencers` already enforces
 * — the brand check, the 409 on a taken handle, the slug chosen server-side —
 * applies unchanged.
 *
 * `status` is **sent, and it is sent as the default the schema already holds**:
 * `CreateInfluencerInputSchema.status` carries `.default("prospect")`, and
 * `z.infer` reads a schema's *output*, so `CreateInfluencerInput.status` is a
 * required key — omitting it would not compile. The value is `prospect` for the
 * default's own reason: somebody just entered is on a shortlist, not booked.
 *
 * `brandIds` and `notes` are genuinely omitted, for the reason the wire type
 * gives — which brands a creator is engaged for is a fact about this company that
 * no public page knows, and the notes column holds rate cards.
 *
 * **An empty follower box converts to `NaN`, tested before the conversion.**
 * `toAccountPayload` records why at length and this is the same line one function
 * over: `Number("")` is `0`, so testing after would launder the untouched box
 * into a real-looking figure. Three things refuse it — the input is `required`,
 * this answers `NaN`, and `InfluencerFollowersSchema` rejects `NaN` with the
 * field named.
 */
export function toCreateInput(draft: QuickAddDraft): CreateInfluencerInput {
  const followers = draft.followers.trim();
  const url = draft.url.trim();
  return {
    name: draft.name.trim(),
    accounts: [
      {
        platform: draft.platform,
        handle: draft.handle.trim(),
        followers: followers === "" ? Number.NaN : Number(followers),
        // **Never carried from the lookup.** No platform publishes an engagement
        // rate, so a figure here was computed from a sample or invented — the
        // engine drops it and this does not put one back.
        engagementRate: null,
        url: url === "" ? null : url,
      },
    ],
    vertical: draft.vertical === "" ? null : draft.vertical,
    status: "prospect",
  };
}

/**
 * The same draft as the **full form's** first account row, for the two escape
 * hatches — `Add manually` after a `not-found`, and `Add more detail` after a
 * good one.
 *
 * Its whole job is that **no keystroke is lost**: somebody who typed a platform
 * and a handle, waited for a lookup and then chose the long way round should find
 * both already filled in. `AccountDraft` holds its numbers as strings, so this is
 * a rename rather than a conversion.
 */
export function toAccountDraft(draft: QuickAddDraft): AccountDraft {
  return {
    platform: draft.platform,
    handle: draft.handle.trim(),
    followers: draft.followers.trim(),
    engagementRate: "",
    url: draft.url.trim(),
  };
}
