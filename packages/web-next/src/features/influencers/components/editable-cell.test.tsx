import type { Influencer } from "@brandfactory/shared";
import { InfluencerSchema } from "@brandfactory/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TABLE_DENSITY_CLASSES, DEFAULT_TABLE_DENSITY } from "@/lib/table-density";

import { EditableCell } from "./editable-cell";
import { NameEditor } from "./inline-editors";

/**
 * The rules an inline editor is wrong about **silently**.
 *
 * A browser pass finds the ones you can see — the pencil appears, the box opens, the value saves.
 * It does not find a commit that fires twice, an `Escape` that writes the value it was cancelling,
 * or a keyboard user dropped on `document.body` in the middle of 146 rows. All three are one
 * mechanism: the editor unmounts on close, and the browser may fire `blur` on the way out.
 *
 * The write itself is not exercised here — `commit` is a stub. What it goes on to do is
 * `patch.test.ts`' subject, and the split is deliberate: this file is about *when* a commit
 * happens, that one is about *what* it sends.
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
    vertical: "beauty",
    brandIds: [],
    status: "prospect",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

function renderCell(commit = vi.fn().mockResolvedValue(true), stacked = false) {
  const influencer = creator();
  render(
    <EditableCell label="name" display={<span>{influencer.name}</span>} stacked={stacked}>
      {(slot) => <NameEditor {...slot} influencer={influencer} commit={commit} />}
    </EditableCell>,
  );
  return { commit, pencil: () => screen.getByRole("button", { name: "Edit name" }) };
}

const open = (pencil: () => HTMLElement) => {
  fireEvent.click(pencil());
  return screen.getByRole("textbox");
};

describe("EditableCell", () => {
  it("puts the pencil in the tab order rather than behind a hover", () => {
    // `opacity-0` and not `hidden`, which is the whole reason a keyboard can reach it. A hidden
    // button is not focusable, and this app's base layer has one `:focus-visible` rule that
    // everything relies on.
    const { pencil } = renderCell();
    expect(pencil().tagName).toBe("BUTTON");
    expect(pencil().className).toContain("opacity-0");
    expect(pencil().className).toContain("group-hover/row:opacity-100");
    expect(pencil().className).toContain("focus-visible:opacity-100");
  });

  it("swaps the display for an editor and back", () => {
    const { pencil } = renderCell();
    expect(screen.queryByRole("textbox")).toBeNull();
    open(pencil);
    expect(screen.getByRole("textbox")).not.toBeNull();
  });

  it("wears the rung's own height, so it cannot grow the row it opened in", () => {
    // `Input` is a fixed `h-10`. An editor at its natural height inside a 32px row pushes every
    // row below it down with the reader's pointer still on the one they clicked.
    const { pencil } = renderCell();
    const editor = open(pencil);
    const rung = TABLE_DENSITY_CLASSES[DEFAULT_TABLE_DENSITY].editor;

    expect(editor.className).toContain(rung);
    expect(editor.className).not.toContain("h-10");
  });

  it("takes the line's height and not the rung's in a stacked cell", () => {
    // The rung is the **cell's content box**, which is free in a one-line cell and already
    // over-full in a two-line one: the Creator cell is a 21px name over an 18.84px handle, so a
    // rung-height editor there adds the difference to the tallest cell in the row and moves every
    // row below it — 10px at `comfortable`, which is the default. Shipped in Phase C and found in
    // 1.49.0's browser pass, because the headless render that signed it off measured the three
    // one-line editors.
    //
    // Asserted as classes rather than as pixels because jsdom lays nothing out: `h-auto` with no
    // vertical padding and no border is a control exactly one line box tall, and there is no
    // number in it to drift against the type scale.
    const { pencil } = renderCell(undefined, true);
    const editor = open(pencil);

    expect(editor.className).toContain("h-auto");
    expect(editor.className).toContain("py-0");
    expect(editor.className).toContain("border-0");
    expect(editor.className).not.toContain(TABLE_DENSITY_CLASSES[DEFAULT_TABLE_DENSITY].editor);
    // Still the thing being overridden: a stacked editor is shorter than the rung, never taller.
    expect(editor.className).not.toContain("h-10");
  });

  it("commits once on Enter, not twice when the blur follows it", async () => {
    // The unmount fires `blur` after `Enter` has already committed. Without the guard this is two
    // identical `PATCH`es and two cache sweeps for one keystroke.
    const { commit, pencil } = renderCell();
    const editor = open(pencil);

    fireEvent.change(editor, { target: { value: "Priya Nair" } });
    // Inside `act`, so the pending state the commit sets and clears settles before the assertions
    // rather than after the test has finished.
    await act(async () => {
      fireEvent.keyDown(editor, { key: "Enter" });
      fireEvent.blur(editor);
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][1]).toEqual({ field: "name", value: "Priya Nair" });
  });

  it("commits on blur, which is what makes clicking away a save", async () => {
    const { commit, pencil } = renderCell();
    const editor = open(pencil);

    fireEvent.change(editor, { target: { value: "Priya Nair" } });
    await act(async () => {
      fireEvent.blur(editor);
    });

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("writes nothing on Escape, including on the blur that follows the unmount", () => {
    // The failure this guards: `Escape` closes the cell, the browser fires `blur` on the removed
    // input, and the editor commits the very value the reader was cancelling.
    const { commit, pencil } = renderCell();
    const editor = open(pencil);

    fireEvent.change(editor, { target: { value: "Nobody" } });
    fireEvent.keyDown(editor, { key: "Escape" });

    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("returns focus to the pencil after a cancel", () => {
    // A keyboard user who escapes an edit must not be dropped on `document.body` halfway down a
    // 146-row table, with the next Tab starting from the top of the document.
    const { pencil } = renderCell();
    const editor = open(pencil);

    fireEvent.keyDown(editor, { key: "Escape" });

    expect(document.activeElement).toBe(pencil());
  });
});
