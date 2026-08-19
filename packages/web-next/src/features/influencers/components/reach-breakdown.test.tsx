import type { Influencer, InfluencerAccount } from "@brandfactory/shared";
import { InfluencerSchema, totalReach } from "@brandfactory/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formatFollowers } from "../format";
import { ReachBreakdown } from "./reach-breakdown";

/**
 * The claims this panel makes that a browser pass cannot check.
 *
 * A screen test is against this package's grain (`vitest.config.ts`: *"not the screens"*), and this
 * file earns its place the same way `brand-profile.test.tsx` does — by asserting the things that go
 * wrong **silently**. Two of them are why it exists:
 *
 * - **The footer has to be the number behind the trigger.** The panel exists to explain the Reach
 *   cell, so a total assembled any other way than `totalReach` — summing only the *measured*
 *   accounts is the obvious slip, since `blendedEngagement` legitimately does exactly that — is a
 *   panel that contradicts the figure it opened from. Both numbers look plausible on screen; only
 *   the arithmetic tells them apart.
 * - **The rows must stay in the record's own order.** Position 0 is the account the creator is
 *   known by (`primaryAccount`: *"here the order is the fact"*), and a panel of follower counts is
 *   the most natural place in this app for somebody to add a helpful `.sort()` by size. The symptom
 *   would be a `Primary` badge on the detail page pointing at one account while this panel leads
 *   with another — two surfaces disagreeing, neither of them obviously wrong.
 *
 * **Plain DOM assertions, no `jest-dom`.** `@testing-library/jest-dom` is a dependency of this
 * package and is deliberately not wired into `test-setup.ts`; see the note in
 * `brand-profile.test.tsx`. One more component test is not the reason to wire it in.
 */

const account = (
  platform: InfluencerAccount["platform"],
  handle: string,
  followers: number,
  engagementRate: number | null = null,
  url: string | null = null,
) => ({ platform, handle, followers, engagementRate, url });

/**
 * A creator, **through `InfluencerSchema.parse`** rather than cast into shape.
 *
 * The ids are branded strings, so a hand-built literal needs an `as unknown as Influencer` to
 * type-check — and a cast is exactly how a fixture ends up asserting a layout against a record the
 * API could never send. Parsing costs nothing here and buys the guarantee: the handles clear
 * `InfluencerHandleSchema`'s no-leading-`@` rule, the url clears `WebsiteUrlSchema`'s `http`/`https`
 * filter, and the account list clears `.min(1)`.
 */
const creator = (accounts: ReturnType<typeof account>[]): Influencer =>
  InfluencerSchema.parse({
    id: "i1",
    workspaceId: "w1",
    slug: "novita-lam",
    name: "Novita Lam",
    accounts,
    vertical: "beauty",
    brandIds: [],
    status: "active",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

/** Entered TikTok first, so the **primary account is deliberately not the largest**. */
const ACCOUNTS = [
  account("tiktok", "novitalam", 241_000),
  account("instagram", "novitalam", 612_000, 4.2, "https://instagram.com/novitalam"),
  account("xiaohongshu", "novita.lam", 37_000),
];

function openPanel(influencer: Influencer): HTMLElement {
  render(<ReachBreakdown influencer={influencer} />);
  fireEvent.click(screen.getByRole("button", { name: /3 accounts/ }));
  return screen.getByRole("table");
}

const text = (node: Element) => node.textContent ?? "";

const totalRow = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .find((row) => text(row).includes("Total"));

describe("ReachBreakdown", () => {
  it("opens from the account count, which is a real button", () => {
    render(<ReachBreakdown influencer={creator(ACCOUNTS)} />);
    // A `<button>` rather than a span with a click handler, so the panel is reachable by keyboard.
    // The plain sub-line this replaced was not focusable at all.
    const trigger = screen.getByRole("button", { name: /3 accounts/ });
    expect(trigger.tagName).toBe("BUTTON");

    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole("table")).not.toBeNull();
  });

  it("sums to the figure in the cell it opened from", () => {
    const influencer = creator(ACCOUNTS);
    const footer = totalRow(openPanel(influencer));

    // Not only a literal. The assertion is that the panel and the Reach cell run the *same*
    // derivation — a hand-typed `890,000` alone would pass against a panel that summed the
    // accounts itself and then drifted from `totalReach` on the next change to either.
    expect(text(footer!)).toContain(formatFollowers(totalReach(influencer.accounts)));
    expect(text(footer!)).toContain("890,000");
  });

  it("counts an unmeasured account into the total and out of the blend", () => {
    const footer = totalRow(openPanel(creator(ACCOUNTS)));

    // Only Instagram carries a rate, so the blend is that rate and the total is all three.
    // Treating `null` as a zero would answer 1.4% here — saying two real accounts engage nobody.
    expect(text(footer!)).toContain("890,000");
    expect(text(footer!)).toContain("4.2%");
  });

  it("keeps the record's own order rather than sorting by size", () => {
    const rows = within(openPanel(creator(ACCOUNTS))).getAllByRole("row");
    // Row 0 is the header. TikTok is entered first and is not the largest.
    expect(text(rows[1])).toContain("241,000");
    expect(text(rows[2])).toContain("612,000");
    expect(text(rows[3])).toContain("37,000");
  });

  it("renders the exact count rather than the table's compact one", () => {
    // `formatCompactNumber` earns the column behind this panel, because a column of counts is
    // scanned down its length. The panel is where somebody checks a figure before quoting it,
    // which is `formatFollowers`' whole argument.
    const table = openPanel(creator(ACCOUNTS));
    expect(text(table)).toContain("612,000");
    expect(text(table)).not.toContain("612.0k");
  });

  it("names every platform beside its mark", () => {
    // The badge rule: the glyph is never the only carrier. Three accounts, three named platforms.
    const table = openPanel(creator(ACCOUNTS));
    for (const label of ["TikTok", "Instagram", "Xiaohongshu"]) {
      expect(text(table)).toContain(label);
    }
  });

  it("links only the handle that carries a url", () => {
    // Nothing is derived from a handle: a guessed link to a real stranger's profile is worse than
    // no link, and xiaohongshu addresses users by an opaque numeric id nobody can guess.
    const links = within(openPanel(creator(ACCOUNTS))).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://instagram.com/novitalam");
  });

  it("offers no control to a creator with one account", () => {
    // There is nothing to split, and `1 account` under every single-account row is noise on most
    // of the table — which is why the sub-line was already conditional before it became a trigger.
    const { container } = render(
      <ReachBreakdown influencer={creator([account("instagram", "priyaskin", 84_200)])} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
