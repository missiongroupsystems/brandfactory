import type { Influencer } from "@brandfactory/shared";
import { InfluencerSchema } from "@brandfactory/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StatusEditor, VerticalEditor } from "./inline-editors";

/**
 * What the menu is for, beyond not being a `<select>`.
 *
 * Phase B of this change is easy to read as a restyle — the cell opened a native select, now it
 * opens a menu, and both look like a list of statuses. It **retires a defect** as well, and the
 * defect is one nobody can see:
 *
 * > *"arrow keys on a closed select fire `change` per press, so a keyboard user stepping through
 * > three statuses could fire three writes. The editor is disabled while the write is in flight,
 * > which caps it at one write per open."*
 *
 * That was the old `EnumEditor`'s own docstring — a cost accepted, bounded by a lock rather than
 * removed. A menu moves a **highlight** on the arrow keys and commits on `Enter` or on click, so
 * stepping through the list writes nothing at all. The test for it is the last one below, and it
 * is the reason this file exists.
 *
 * The write itself is not exercised here — `commit` is a stub. What it goes on to send is
 * `patch.test.ts`' subject, and the split is deliberate: this file is about *when* a commit
 * happens, that one is about *what* it sends.
 *
 * **Plain DOM assertions, no `jest-dom`** — the note in `editable-cell.test.tsx` applies.
 */

const creator = (): Influencer =>
  InfluencerSchema.parse({
    id: "i1",
    workspaceId: "w1",
    slug: "priya-raman",
    name: "Priya Raman",
    accounts: [
      { platform: "instagram", handle: "priyaskin", followers: 84_200, engagementRate: null, url: null },
    ],
    vertical: null,
    brandIds: [],
    status: "prospect",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

function renderStatus(commit = vi.fn().mockResolvedValue(true)) {
  const influencer = creator();
  render(
    <StatusEditor influencer={influencer} commit={commit} display={<span>Prospect</span>} />,
  );
  return { commit, trigger: () => screen.getByRole("button", { name: /Prospect/ }) };
}

describe("StatusEditor", () => {
  it("opens a menu of radio items with the record's value ticked", () => {
    // `menuitemradio` rather than `menuitem`: this is one choice from a closed list, which is
    // exactly what the role means, and it is the half of "a menu is the honest control here" that
    // a screenshot cannot show. The ticked item is what tells a reader which status they are
    // looking at *before* they choose a different one.
    const { trigger } = renderStatus();
    expect(screen.queryByRole("menu")).toBe(null);

    fireEvent.click(trigger());

    const items = screen.getAllByRole("menuitemradio");
    expect(items).toHaveLength(3);
    const checked = items.filter((item) => item.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toContain("Prospect");
  });

  it("commits once when a status is chosen", async () => {
    const { commit, trigger } = renderStatus();
    fireEvent.click(trigger());

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitemradio", { name: /Active/ }));
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][1]).toEqual({ field: "status", value: "active" });
  });

  it("closes the menu on the choice rather than leaving it open over a saving cell", async () => {
    // Base UI's `Menu.RadioItem` does not close the popup on select by default — a radio group is
    // often something you tick more than once. Here it is exactly one choice, so leaving it open
    // would offer a second choice the disabled trigger has no way to refuse.
    const { trigger } = renderStatus();
    fireEvent.click(trigger());

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitemradio", { name: /Active/ }));
    });

    expect(screen.queryByRole("menu")).toBe(null);
  });

  it("writes nothing while the arrow keys move through the list", async () => {
    // **The defect the native select accepted and this retires.** Three presses used to be three
    // `change` events, and so up to three `PATCH`es over one column, settling in whatever order
    // they returned — capped at one only because the control locked itself mid-flight. A menu
    // moves a highlight; nothing is chosen until `Enter` or a click.
    const { commit, trigger } = renderStatus();
    fireEvent.click(trigger());

    const menu = screen.getByRole("menu");
    await act(async () => {
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      fireEvent.keyDown(menu, { key: "ArrowUp" });
    });

    expect(commit).not.toHaveBeenCalled();
  });
});

describe("VerticalEditor", () => {
  it("offers Generalist as a real option rather than a blank one", () => {
    // `InfluencerSchema` says `null` here is *"a genuine generalist, not an unclassified row"* —
    // which is why the union has no `other` member. An unlabelled empty item would state the one
    // thing the schema went out of its way not to mean, and the cell's own display already carries
    // the word.
    const influencer = creator();
    render(
      <VerticalEditor
        influencer={influencer}
        commit={vi.fn().mockResolvedValue(true)}
        display={<span>Generalist</span>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Generalist/ }));

    const generalist = screen
      .getAllByRole("menuitemradio")
      .find((item) => item.textContent === "Generalist");
    expect(generalist).not.toBe(undefined);
    // The record's `vertical` is `null`, so the empty option is the one that reads as chosen.
    expect(generalist!.getAttribute("aria-checked")).toBe("true");
  });
});
