import {
  InfluencerPlatformSchema,
  type Influencer,
  type InfluencerAccount,
  type InfluencerPlatform,
} from './influencer'

// ---------------------------------------------------------------------------
// Reach — the four figures a creator's accounts add up to
// ---------------------------------------------------------------------------
//
// A creator's reach used to be a column. It is now a sum over the child rows, so
// something has to do the addition, and this file is the one place that does.
//
// **Derived on read, never stored, and never sent as a server-computed field.**
// A `totalFollowers` on the wire would be a number that can disagree with the
// array printed beside it — the tier was already derived from a figure the row
// carried, and this is the same call one level down.
//
// **In `@brandfactory/shared` rather than in `web-next` because the server needs
// it too.** `listInfluencersByWorkspace` sorts the roster by reach, and reach is
// now a sum no `ORDER BY` can reach without a join and a `GROUP BY`. One
// definition, one test file, both sides.

/**
 * The plain sum of every account's follower count.
 *
 * **It double-counts a person who follows the same creator on two platforms**,
 * and that is the figure the trade quotes: every rate card in the market adds the
 * platforms up. The detail page prints the split directly above the total, so the
 * sum is never the only number on the screen and a reader can always see what it
 * is made of.
 */
export function totalReach(accounts: readonly InfluencerAccount[]): number {
  return accounts.reduce((sum, account) => sum + account.followers, 0)
}

/**
 * The follower-weighted mean engagement rate, or `null` when nobody has measured
 * any of the accounts.
 *
 * **Weighted rather than averaged**, because an 88k account at 6.0% and an 840k
 * account at 1.1% average to 3.55% and describe nobody. Weighting answers 1.56%,
 * which is what a campaign across both would actually see.
 *
 * **An account with `null` drops out of both halves of the fraction** — out of the
 * numerator and out of the weight. Treating it as a zero would let an unmeasured
 * account drag a real rate down, which turns "nobody has measured it" into "it is
 * bad": the exact distinction `format.ts` says this aggregate has already
 * defended three times.
 *
 * The result is rounded to two decimals. The inputs come out of a
 * `numeric(5,2)` column, so the blend cannot honestly claim more precision than
 * the figures it is made of, and the rounding keeps binary-float noise out of a
 * number the screen prints.
 *
 * **The zero-weight case is a plain mean.** A creator whose only measured account
 * has 0 followers — a new account somebody has already run a story on — would
 * otherwise divide by zero. The unweighted mean of the measured rates is the
 * honest answer there, and it is also what keeps a single account's own rate
 * coming back unchanged, which is parity with the column this replaced.
 */
export function blendedEngagement(accounts: readonly InfluencerAccount[]): number | null {
  const measured = accounts.filter(
    (account): account is InfluencerAccount & { engagementRate: number } =>
      account.engagementRate !== null,
  )
  if (measured.length === 0) return null

  const weight = measured.reduce((sum, account) => sum + account.followers, 0)
  const mean =
    weight === 0
      ? measured.reduce((sum, account) => sum + account.engagementRate, 0) / measured.length
      : measured.reduce((sum, account) => sum + account.engagementRate * account.followers, 0) /
        weight

  return Math.round(mean * 100) / 100
}

/**
 * The account the creator is known by — position 0, which is the order somebody
 * put the list in.
 *
 * **Not the largest follower count.** A refreshed number would then silently
 * change the line that identifies the person, and a creator leads with a handle
 * rather than with whichever platform is biggest this month. There is no
 * `is_primary` column either: here the order *is* the fact, unlike
 * `vendor_contacts`, where who answers the phone and where the row sits in the
 * list are two different things.
 *
 * **It throws on an empty array rather than answering `undefined`.**
 * `InfluencerAccountsSchema` is `.min(1)`, so no record that came through the
 * wire can reach this — and the alternative is a nullable return that a dozen
 * call sites each invent a different fallback for. The type system cannot carry
 * the guarantee: zod 4's `.nonempty()` no longer narrows to a tuple, and the
 * tuple schema that would costs the `.max(10)` and the min/max messages the form
 * renders.
 */
export function primaryAccount(accounts: readonly InfluencerAccount[]): InfluencerAccount {
  const first = accounts[0]
  if (!first) {
    throw new Error('An influencer carries at least one account — this list is empty')
  }
  return first
}

/**
 * The distinct platforms a creator posts on, **in enum order** rather than in the
 * order the accounts were entered.
 *
 * Enum order because the table prints these as chips in a fixed column: a creator
 * who reorders their accounts would otherwise get a different-looking row for a
 * change that says nothing about which platforms they are on. Two accounts on one
 * platform — three Instagram accounts is a real creator — collapse to one chip.
 */
export function platformsOf(accounts: readonly InfluencerAccount[]): InfluencerPlatform[] {
  const present = new Set(accounts.map((account) => account.platform))
  return InfluencerPlatformSchema.options.filter((platform) => present.has(platform))
}

/**
 * The canonical ordering: **total reach descending, then name, then id.**
 *
 * **Reach descending, the opposite of every other list in this repo**, which sort
 * alphabetically because they are read as directories. This one is read as a
 * budget conversation: the few expensive names at the top, the long tail below.
 * The reach tiers are ordered the same way for the same reason.
 *
 * **The comparator no longer mirrors an `ORDER BY`; it replaces one.** Reach is a
 * sum over the child rows now, so `listInfluencersByWorkspace` sorts the assembled
 * array in memory and `influencers_workspace_followers_idx` goes with the column
 * it indexed. That is correct at this list's size and stays correct up to the
 * tripwire the query already writes down — the point where the keyset cursor and
 * the SQL filters have to land together.
 *
 * `name` breaks a tie because two creators on a round number — 10,000 followers
 * is common — would otherwise order by id, which is to say arbitrarily and
 * differently on every read.
 *
 * It lives here rather than in `influencer.ts` because it reads `totalReach`, and
 * the import the other way round would be a cycle.
 */
export function byInfluencerReach(a: Influencer, b: Influencer): number {
  const reachA = totalReach(a.accounts)
  const reachB = totalReach(b.accounts)
  if (reachA !== reachB) return reachB - reachA
  const byName = a.name.localeCompare(b.name)
  return byName !== 0 ? byName : a.id.localeCompare(b.id)
}
