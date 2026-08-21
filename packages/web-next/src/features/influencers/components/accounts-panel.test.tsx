import type { Influencer, InfluencerAccount } from "@brandfactory/shared";
import { InfluencerSchema } from "@brandfactory/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountsPanel } from "./accounts-panel";

/**
 * The claims this panel makes that a browser pass cannot check.
 *
 * A screen test is against this package's grain (`vitest.config.ts`: *"not the screens"*), and
 * this file earns its place the way `reach-breakdown.test.tsx` did before it — by asserting the
 * things that go wrong **silently**. It inherits one of that file's two reasons and adds a sharper
 * one of its own:
 *
 * - **The rows must stay in the record's own order.** Position 0 is the account the creator is
 *   known by (`primaryAccount`: *"here the order is the fact"*), and a panel of follower counts is
 *   the most natural place in this app for somebody to add a helpful `.sort()` by size. The panel
 *   *writes* that order now, so a sort here would not merely disagree with the detail page — it
 *   would silently re-primary a creator on the next save.
 * - **A field the panel does not show still has to survive the write.** `url` has no column here,
 *   and this write is a **full replacement of the account list**. A draft that dropped it would
 *   clear every stored profile link on the roster, one creator at a time, with a green result and
 *   nothing on screen to notice.
 *
 * The wire body is not built here — `commit` is a stub, and what `{accounts}` becomes is
 * `patch.test.ts`' subject.
 *
 * **Plain DOM assertions, no `jest-dom`** — the note in `editable-cell.test.tsx` applies.
 */

const account = (
  platform: InfluencerAccount["platform"],
  handle: string,
  followers: number,
  engagementRate: number | null = null,
  url: string | null = null,
): InfluencerAccount => ({ platform, handle, followers, engagementRate, url });

const creator = (accounts: InfluencerAccount[]): Influencer =>
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
];

const LABEL = "Edit the accounts of Novita Lam";

function openPanel(influencer: Influencer, commit = vi.fn().mockResolvedValue(true)) {
  render(<AccountsPanel influencer={influencer} commit={commit} label={LABEL} />);
  fireEvent.click(screen.getByRole("button", { name: LABEL }));
  return { commit };
}

const box = (label: string) => screen.getByRole("textbox", { name: label }) as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: /^Sav/ }) as HTMLButtonElement;

describe("AccountsPanel", () => {
  it("opens from a real button, so the panel is reachable by keyboard", () => {
    render(
      <AccountsPanel influencer={creator(ACCOUNTS)} commit={vi.fn()} label={LABEL} />,
    );
    const trigger = screen.getByRole("button", { name: LABEL });
    expect(trigger.tagName).toBe("BUTTON");

    expect(screen.queryByRole("table")).toBe(null);
    fireEvent.click(trigger);
    expect(screen.getByRole("table")).not.toBe(null);
  });

  it("opens for a creator with one account, which the read-only panel refused to do", () => {
    // `ReachBreakdown` returned `null` below two accounts, and rightly: `1 account` under
    // eighty-odd rows was noise. That rule was about a *sub-line*. The trigger is the cell now, so
    // a one-account creator can correct their follower count from the roster for the first time.
    openPanel(creator([account("instagram", "priyaskin", 84_200)]));
    expect(box("Handle of account 1").value).toBe("priyaskin");
  });

  it("keeps the record's own order rather than sorting by size", () => {
    openPanel(creator(ACCOUNTS));
    // TikTok is entered first and is not the largest. Position 0 is the fact.
    expect(box("Handle of account 1").value).toBe("novitalam");
    expect(box("Followers of account 1").value).toBe("241000");
    expect(box("Followers of account 2").value).toBe("612000");
  });

  it("carries a url it never shows back into the write", () => {
    // The failure this exists for: the write is a full replacement, so a draft that dropped `url`
    // would clear a stored profile link on every save. There is no `url` box in the panel — the
    // draft seeds it from the record and hands it straight back.
    const { commit } = openPanel(creator(ACCOUNTS));
    fireEvent.change(box("Followers of account 1"), { target: { value: "250000" } });

    return act(async () => {
      fireEvent.click(saveButton());
    }).then(() => {
      expect(commit).toHaveBeenCalledTimes(1);
      const edit = commit.mock.calls[0][1];
      expect(edit.field).toBe("accounts");
      expect(edit.value[0].followers).toBe(250_000);
      expect(edit.value[1].url).toBe("https://instagram.com/novitalam");
      // And the rate the panel *did* show, unchanged rather than re-parsed into something else.
      expect(edit.value[1].engagementRate).toBe(4.2);
    });
  });

  it("refuses to save an emptied follower box, and says which rule stopped it", () => {
    // `Number("")` is `0`, so an untouched box would otherwise launder into a creator entered on
    // zero followers — who lands in Nano and looks like a real reading. The draft holds strings
    // precisely so this stays tellable, and the panel has no `<form>` to lean on for `required`.
    const { commit } = openPanel(creator(ACCOUNTS));
    fireEvent.change(box("Followers of account 1"), { target: { value: "" } });

    expect(saveButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("follower count");
    expect(commit).not.toHaveBeenCalled();
  });

  it("refuses a repeated platform and handle before the request rather than after it", () => {
    // The one refusal only the database can make. A panel that let it through would spend a round
    // trip to answer a 409 about a conflict the reader could see on screen.
    openPanel(creator(ACCOUNTS));
    // Row 1 is TikTok and row 2 is Instagram, so the two already share a handle: the pair only
    // repeats once the platform matches as well. Compared exactly, not case-folded, because
    // `influencer_accounts_workspace_platform_handle_key` compares exactly.
    fireEvent.change(screen.getByRole("combobox", { name: "Platform of account 2" }), {
      target: { value: "tiktok" },
    });

    expect(saveButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("already listed above");
  });

  it("will not remove a creator's last account", () => {
    // `InfluencerAccountsSchema` is `.min(1)`, and it is what keeps the tier grouping total.
    // Disabled with a reason rather than a save that fails after the work.
    openPanel(creator([account("instagram", "priyaskin", 84_200)]));
    const remove = screen.getByRole("button", { name: /a creator needs at least one account/i });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
  });

  it("makes an account primary by moving it to the top, and writes the new order", () => {
    // There is no `is_primary` column — the order carries it — so this is the whole of "make
    // primary", and it is the edit that would vanish if anything compared the list as a set.
    const { commit } = openPanel(creator(ACCOUNTS));
    fireEvent.click(screen.getByRole("button", { name: /Make @novitalam the primary account/ }));

    expect(box("Handle of account 1").value).toBe("novitalam");
    expect(box("Followers of account 1").value).toBe("612000");

    return act(async () => {
      fireEvent.click(saveButton());
    }).then(() => {
      const edit = commit.mock.calls[0][1];
      expect(edit.value.map((a: InfluencerAccount) => a.platform)).toEqual(["instagram", "tiktok"]);
    });
  });

  it("throws the draft away on close, so reopening shows the record and not last time's typing", () => {
    // A popup's content survives its close. AGENTS.md records the same wedge twice for sheets, and
    // records that keying the popup is not the fix — the draft is re-seeded during render when
    // `open` flips true. On this panel the stale draft would be the creator's whole account list,
    // which looks exactly like the record until somebody presses `Save`.
    const influencer = creator(ACCOUNTS);
    render(<AccountsPanel influencer={influencer} commit={vi.fn()} label={LABEL} />);

    fireEvent.click(screen.getByRole("button", { name: LABEL }));
    fireEvent.change(box("Followers of account 1"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: LABEL }));
    expect(box("Followers of account 1").value).toBe("241000");
  });
});
