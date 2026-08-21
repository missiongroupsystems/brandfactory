import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TABLE_DENSITY_CLASSES, DEFAULT_TABLE_DENSITY } from "@/lib/table-density";

import { CellTrigger } from "./editable-cell";

/**
 * The properties the cell trigger inherited from the pencil it replaced, and the ones it added.
 *
 * A browser pass finds what a restyle looks like. It does not find that the control left the tab
 * order, that a screen reader stopped hearing the value in the cell, or that the tint is the same
 * token the row already paints so it disappears at the moment a pointer arrives. All four
 * assertions here are of that kind — the change is a visual one, and these are the parts of it
 * that are invisible.
 *
 * **Plain DOM assertions, no `jest-dom`.** `@testing-library/jest-dom` is a dependency of this
 * package and is deliberately not wired into `test-setup.ts`; see the note in
 * `brand-profile.test.tsx`.
 */
describe("CellTrigger", () => {
  it("is a real button in the tab order, not a hover-revealed one", () => {
    // The pencil was `opacity-0` and not `hidden` for exactly this reason: a hidden button is not
    // focusable, and this app's base layer has one `:focus-visible` rule that everything relies
    // on. The cell-wide trigger keeps the property and drops the trick — nothing is revealed, so
    // nothing is reserved, so nothing shifts on hover.
    render(<CellTrigger label="Edit status">Prospect</CellTrigger>);

    const trigger = screen.getByRole("button");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("type")).toBe("button");
    expect(trigger.className).not.toContain("opacity-0");
    expect(trigger.className).not.toContain("group-hover/row");
  });

  it("keeps the cell's value in its accessible name and adds the verb", () => {
    // Not `aria-label`, which would *replace* the name. The value is the thing a screen-reader
    // user is moving down the column to hear, and 146 buttons all named "Edit status" say nothing
    // about any row. The name reads "Prospect Edit status".
    render(<CellTrigger label="Edit status">Prospect</CellTrigger>);

    const trigger = screen.getByRole("button", { name: /Prospect/ });
    expect(trigger.textContent).toContain("Prospect");
    expect(trigger.textContent).toContain("Edit status");
    expect(trigger.getAttribute("aria-label")).toBe(null);
  });

  it("names itself entirely from the label when the cell gives it no content", () => {
    // The Platforms cell's trigger is a *sibling* of the badges and holds nothing of its own — a
    // button with no content and no label is a button a screen reader announces as "button".
    render(<CellTrigger label="Edit the accounts of Priya Raman" />);
    expect(screen.getByRole("button", { name: "Edit the accounts of Priya Raman" })).not.toBe(null);
  });

  it("tints one step deeper than the row it sits in", () => {
    // `TableRow` already paints `bg-surface-hover` across the whole row on hover, so a cell tint
    // at that token would be invisible at exactly the moment it is needed. This is the assertion
    // that fails if somebody "harmonises" the two.
    render(<CellTrigger label="Edit status">Prospect</CellTrigger>);

    const trigger = screen.getByRole("button");
    expect(trigger.className).toContain("hover:bg-surface-selected");
    expect(trigger.className).not.toContain("hover:bg-surface-hover");
    // The keyboard gets what the pointer gets, and an open popup keeps its cell marked while the
    // reader is looking at the list rather than at the row.
    expect(trigger.className).toContain("focus-visible:bg-surface-selected");
    expect(trigger.className).toContain("aria-expanded:bg-surface-selected");
  });

  it("wears the rung's own height, so it cannot grow the row it sits in", () => {
    // The measurement `lib/table-density.ts` defines as the cell's content box exactly. A trigger
    // at a control primitive's natural 40px inside a 32px `compact` row would push every row below
    // it down.
    render(<CellTrigger label="Edit status">Prospect</CellTrigger>);
    expect(screen.getByRole("button").className).toContain(
      TABLE_DENSITY_CLASSES[DEFAULT_TABLE_DENSITY].editor,
    );
  });

  it("lets a two-line cell override the rung rather than clip its second line", () => {
    // The Reach cell is a figure over an account count. `twMerge` is what makes the override work
    // at all — two `h-` classes on one element, last one wins — and this pins that it does.
    render(
      <CellTrigger label="Edit the accounts" className="h-auto">
        890.0k
      </CellTrigger>,
    );
    const trigger = screen.getByRole("button");
    expect(trigger.className).toContain("h-auto");
    expect(trigger.className).not.toContain(TABLE_DENSITY_CLASSES[DEFAULT_TABLE_DENSITY].editor);
  });

  it("draws the chevron at all times on a cell that opens a list", () => {
    // The one thing the pencil never managed to say. Drawn rather than revealed: a mark that
    // appears under the pointer has to reserve its width anyway, and reserving it without drawing
    // it buys nothing but a flicker.
    const { container } = render(
      <CellTrigger label="Edit status" chevron>
        Prospect
      </CellTrigger>,
    );
    expect(container.querySelector("svg")).not.toBe(null);
  });

  it("refuses a second press while its write is in flight, and says so", () => {
    // **Nothing is optimistic**, so the cell cannot show the new value as a fact while the write
    // is in flight. What it shows is the value it still holds, with a spinner beside it — "this is
    // being saved", never "this is saved". The server's answer is what re-renders it.
    render(
      <CellTrigger label="Edit status" chevron pending>
        Prospect
      </CellTrigger>,
    );
    const trigger = screen.getByRole("button") as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    expect(trigger.querySelector(".animate-spin")).not.toBe(null);
  });
});
