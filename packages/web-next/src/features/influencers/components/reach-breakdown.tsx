"use client";

import type { Influencer } from "@brandfactory/shared";
import { blendedEngagement, totalReach } from "@brandfactory/shared";
import { ExternalLinkIcon } from "lucide-react";

import { Value } from "@/components/layout/table-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { formatAccountCount, formatEngagement, formatFollowers } from "../format";
import { PlatformBadge } from "./platform-badges";

/**
 * What a creator's reach is made of, hung off the one line that already admits it is a sum.
 *
 * ── Why it hangs off *that* line ──────────────────────────────────────────
 *
 * The Reach cell prints `890.0k` with `3 accounts` beneath it, and `format.ts` describes that
 * sub-line as *"the only thing on that screen that says the figure is a sum"*. It is therefore the
 * honest place to put the parts: the reader is already looking at the sentence that told them
 * there were parts.
 *
 * The question it answers is the one a planner asks of a roster and could previously only answer
 * one navigation at a time — **how many of those 890k are on Instagram**. The number that decides a
 * budget was on the table; the number that decides which platform to brief was on the record page.
 *
 * It does **not** answer "who has the biggest Instagram following on this list", which is a
 * question about the *column* rather than about one creator. That is Phase I of the plan and it is
 * optional, because it costs a column per platform and a horizontal scroll container.
 *
 * ── `Popover`, not `DropdownMenu` ─────────────────────────────────────────
 *
 * AGENTS.md draws that line and this is the clear side of it: a menu is `role="menu"` and promises
 * `menuitem` children with roving arrow-key focus. This panel is **content** — a small table with
 * two links in it — so a menu role would announce "menu, 4 items" over four rows of figures and
 * fight the links' own keyboard handling.
 *
 * ── Nothing new in `format.ts` ────────────────────────────────────────────
 *
 * Every figure here is one of the three rules that file already holds: `formatFollowers` for the
 * exact count, `formatEngagement` for the one-decimal rate, `formatAccountCount` for the trigger.
 * The panel explains the two figures the row already shows rather than offering a third, which is
 * why it introduces no fourth way of spelling a number.
 */

/**
 * The `N accounts` sub-line, as a control.
 *
 * **Nothing at all for a single-account creator**, which is the behaviour this cell already had and
 * the reason is unchanged: `1 account` under every single-account row is noise on most of the
 * table, and there is nothing to split. The plan allowed rendering it as plain text; that would put
 * a line back under 80-odd rows to say a thing the absence of a sub-line already says.
 */
export function ReachBreakdown({ influencer }: { influencer: Influencer }) {
  const { accounts } = influencer;
  if (accounts.length < 2) return null;

  const total = totalReach(accounts);
  const blended = blendedEngagement(accounts);

  return (
    <Popover>
      {/* The dashed underline is this app's "there is more here" affordance — the same mark
          `NamesTooltip` puts under the Brands cell one column over. A real button, so the panel
          opens from the keyboard; no padding and no border, so the trigger occupies exactly the
          space the plain sub-line did and the row height does not move between the two states. */}
      <PopoverTrigger className="mt-0.5 rounded-md font-sans text-helper text-ink-tertiary underline decoration-ink-tertiary/60 decoration-dashed underline-offset-4 hover:text-ink">
        {formatAccountCount(accounts.length)}
        <span className="sr-only">— show the reach per account</span>
      </PopoverTrigger>

      {/* `align="end"`: the trigger sits in a right-aligned numeric column, so a panel growing
          rightwards would hang off the Tier column and, on the last columns, off the card. */}
      {/* **`w-auto` and no `max-w`.** The panel is four columns of short values, so its natural
          width is bounded by the longest handle — about 430px at the worst case this schema
          allows. A cap would clip a handle inside a rounded popup rather than wrap it, and a
          truncated handle is the one value here nobody can act on. */}
      <PopoverContent align="end" className="w-auto p-0">
        <table className="w-full text-left text-helper">
          <caption className="sr-only">
            {influencer.name} — followers and engagement per account
          </caption>
          <thead>
            <tr className="border-b border-border-subtle text-eyebrow text-ink-tertiary">
              {/* The first two columns are self-evident on screen and would only add width; the
                  two numeric ones are not, because a column of figures with an em dash in it says
                  nothing about what was or was not measured. */}
              <th scope="col" className="py-2 pr-3 pl-4 font-medium">
                <span className="sr-only">Platform</span>
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                <span className="sr-only">Handle</span>
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Followers
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Engagement
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              // Keyed on the pair, which is unique per workspace by
              // `influencer_accounts_workspace_platform_handle_key` — not on the index, which
              // changes under a reorder. Same key the detail page's card uses.
              <tr key={`${account.platform}/${account.handle}`}>
                <td className="py-1.5 pr-3 pl-4">
                  <PlatformBadge platform={account.platform} />
                </td>
                <td className="py-1.5 pr-3">
                  {/* Linked only where a `url` is stored, and **nothing is derived from a
                      handle** — a guessed link to a real stranger's profile is worse than no
                      link, and xiaohongshu addresses users by an opaque numeric id nobody can
                      guess. The glyph is the affordance rather than decoration: three handles in
                      one column and only some of them clickable is invisible until the pointer is
                      already on one. Both rules are the detail page's, restated because this is
                      the second surface to render the same list. */}
                  {account.url ? (
                    <a
                      href={account.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-md font-mono text-ink-secondary hover:text-brand hover:underline"
                    >
                      @{account.handle}
                      <ExternalLinkIcon aria-hidden className="size-3 shrink-0 text-ink-tertiary" />
                      <span className="sr-only">Opens the profile in a new tab</span>
                    </a>
                  ) : (
                    <span className="font-mono text-ink-secondary">@{account.handle}</span>
                  )}
                </td>
                {/* **The exact count, not the table's `890.0k`.** `formatCompactNumber` earns the
                    column behind this because a column of counts is scanned down its length; a
                    panel somebody opened to see the split is the place they check a figure before
                    quoting it, which is `formatFollowers`' whole argument. */}
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-ink">
                  {formatFollowers(account.followers)}
                </td>
                {/* `Value`'s em dash means **nobody has measured this account** — not `PENDING`,
                    which is this app's mark for a request in flight, and not a zero, which is a
                    measurement. An unmeasured account leaves both halves of the blend below. */}
                <td className="py-1.5 pr-4 text-right font-mono tabular-nums text-ink-secondary">
                  <Value mono>{formatEngagement(account.engagementRate)}</Value>
                </td>
              </tr>
            ))}
          </tbody>
          {/* **The footer restates the two figures the row shows rather than offering a third.**
              That is what makes the panel an explanation: the total has to be the number behind
              the trigger, and the rate has to be the one in the Engagement column two cells over.
              Both are the same two functions the server sorts with. */}
          <tfoot>
            <tr className="border-t border-border">
              <th scope="row" colSpan={2} className="py-2 pr-3 pl-4 font-medium text-ink">
                Total
              </th>
              <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink">
                {formatFollowers(total)}
              </td>
              <td className="py-2 pr-4 text-right font-mono tabular-nums text-ink-secondary">
                <Value mono>{formatEngagement(blended)}</Value>
              </td>
            </tr>
            {/* **`blended` is load-bearing and is therefore said in words**, as the detail page
                labels it. The rate is the follower-weighted mean across the measured accounts, so
                an unlabelled figure under a column of per-account rates reads as their average —
                and an 88k account at 6.0% beside an 840k at 1.1% average to 3.55%, which describes
                nobody. The second sentence is the other half of the same rule: an account with no
                rate leaves *both* halves of the fraction rather than counting as a zero, which is
                what the em dashes above it mean.

                On its own line rather than in a cell, so the two numeric columns stay columns of
                numbers; left-aligned, because a footnote that wraps reads as prose and prose
                right-aligned over two ragged lines does not. */}
            <tr>
              <td colSpan={4} className="pr-4 pb-3 pl-4 text-helper text-ink-tertiary">
                Blended engagement is weighted by followers. Unmeasured accounts are left out.
              </td>
            </tr>
          </tfoot>
        </table>
      </PopoverContent>
    </Popover>
  );
}
