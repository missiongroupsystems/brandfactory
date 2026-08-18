/**
 * The boundary between a creator's record and a screen, in both directions.
 *
 * Three surfaces touch the same fields now — the table, the detail page and the
 * form — so every rule about how a number appears, and how a typed one comes back,
 * lives here rather than in whichever component needed it first.
 * `formatEngagement` was a private function inside `influencers-browser.tsx` until
 * this release; a second copy on the detail page would have been the drift this
 * file exists to stop, and the rule it carries is the kind that is only ever wrong
 * by one character.
 *
 * Nothing here is promoted to `lib/format.ts`. Every rule is about *this* record: a
 * percent quoted to one decimal because the column behind it is `numeric(5,2)`, an
 * exact follower count that exists only because the table shows a compact one, and
 * an empty input that has to stay apart from a measured zero.
 *
 * **The arithmetic is not here.** `totalReach` and `blendedEngagement` live in
 * `@brandfactory/shared` because the server sorts by reach and needs the same
 * definition; this file only decides how the answers are spelled. `formatEngagement`
 * takes the blended figure exactly as it took the stored one.
 *
 * **There is no `formatHandle`.** Both surfaces draw the `@` as a separate element
 * beside the handle — the column never carries one, because `InfluencerHandleSchema`
 * rejects a leading sigil rather than stripping it — and the table wraps the handle
 * in `HighlightMatch`. A function returning `"@priyaskin"` would either put the sigil
 * inside the highlighted span or force the caller to take it back apart.
 */

/**
 * A creator's engagement rate as it belongs on screen.
 *
 * **One decimal, always**, and that is a correction rather than a preference. The
 * column is `numeric(5,2)`, so `2.00` in the database becomes `2` on the wire —
 * JSON has one number type and `Number('2.00')` is `2`. Rendering the value raw
 * put `2%` in a column of `3.8%` and `14.2%`, which reads as a different kind of
 * measurement rather than as the same one.
 *
 * `null` is handed back as `null` and left to the caller's empty state: nobody has
 * measured it, which is not the same as a measured zero.
 */
export function formatEngagement(rate: number | null): string | null {
  return rate === null ? null : `${rate.toFixed(1)}%`;
}

/**
 * How many accounts a creator's reach is the sum of — `1 account`, `3 accounts`.
 *
 * It sits under the total in the table's Reach column, and it is the only thing on that screen
 * that says the figure is a **sum**. Without it, a creator on 140k reads as one account of 140k,
 * which is the misreading `influencer_accounts` exists to remove: the three-platform creator was
 * being filed into Micro three times before that table landed.
 *
 * The plural is spelled out rather than parenthesised — `3 account(s)` is a form field's habit,
 * not a sentence somebody reads down a column.
 */
export function formatAccountCount(count: number): string {
  return count === 1 ? "1 account" : `${count} accounts`;
}

const EXACT = new Intl.NumberFormat("en-SG");

/**
 * The follower count in full — `1,240,000`, not `1.24M`.
 *
 * **The detail page's figure, never the table's.** `formatCompactNumber` exists
 * because a column of counts is scanned down its length and `1.24M` beside `84.2k`
 * is comparable at a glance where the full digits are not. A record page has the
 * opposite job: it is the place somebody checks the number they are about to quote,
 * and a rounded figure is the one thing it must not show them.
 *
 * `en-SG` grouping, matching `formatDateTime` and `formatMoney` in
 * `lib/format.ts` — an explicit locale rather than the runtime's, so the server
 * render and the client agree.
 */
export function formatFollowers(followers: number): string {
  return EXACT.format(followers);
}

/**
 * The word for a creator who covers no one vertical.
 *
 * **Not the em dash**, and this is the same argument `GROUP_LEVEL` makes one
 * aggregate over. `InfluencerSchema` says `null` here is *"a genuine generalist,
 * not an unclassified row"* — the union deliberately has no `other` member, so
 * that nobody has to file a photographer who shoots whatever the brief is beside
 * the rows somebody has yet to classify. The em dash is this app's word for "not
 * recorded", so rendering it would state the one thing the schema went out of its
 * way not to mean.
 *
 * One constant, both surfaces, so the table and the page cannot drift.
 */
export const GENERALIST = "Generalist";

/**
 * A form's text input back into an optional number: `""` → `null`, and **`"0"` → `0`**.
 *
 * `toNullable`'s sibling in `hooks/use-submit.ts`, and it cannot be that function: that one tests
 * the trimmed string for truthiness, which is right for text and would turn a measured `0%` into
 * "nobody measured".
 *
 * **That distinction has now cost this aggregate three separate defences**, which is why it is
 * pinned here rather than left inline in the form. `rowToInfluencer` had to avoid `Number(null)`
 * being `0` on the way out of the database; `formatEngagement` has to hand `null` back rather than
 * render `0.0%`; and this is the way in. A prospect nobody has run a campaign with has no
 * engagement history, and a creator measured at zero engagement has a very bad one.
 *
 * Anything unparseable also falls to `null` rather than to `NaN`, which JSON serialises as `null`
 * anyway — stating it here means the payload says what it means instead of arriving at it.
 */
export function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
