import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/api/bf-client";

import { useResourceMutations } from "../hooks";
import { ResourceForm } from "./resource-form";

/**
 * Two claims about this form, each guarding a defect this codebase has actually shipped.
 *
 * `vi.mock("../hooks")` the same way `resources-view.test.tsx` mocks its own hooks module —
 * this package's rule is "not the screens" (`vitest.config.ts`), so what earns a test here is
 * behaviour a browser pass would not catch, not the fetch itself.
 */

vi.mock("../hooks", () => ({
  useResourceMutations: vi.fn(),
}));

const mockedUseResourceMutations = vi.mocked(useResourceMutations);

function setup(create = vi.fn()) {
  const update = vi.fn();
  mockedUseResourceMutations.mockReturnValue({ create, update, remove: vi.fn() });
  render(<ResourceForm brandId="b1" open onOpenChange={vi.fn()} />);
  return { create, update };
}

// `exact: false`: a required field's label reads "Title*" in `textContent` — the asterisk is
// `aria-hidden` for assistive tech but still part of the string an exact match tests against.
// AGENTS.md records this for Playwright's `getByLabel`; Testing Library's `getByLabelText` has
// the identical trap for the identical reason.
function fillUrl(value: string) {
  fireEvent.change(screen.getByLabelText("URL", { exact: false }), { target: { value } });
}

function fillTitle(value: string) {
  fireEvent.change(screen.getByLabelText("Title", { exact: false }), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Add resource" }));
}

describe("ResourceForm", () => {
  it("refuses to submit an empty title", () => {
    const { create } = setup();

    // URL is filled in and valid; title is left at its empty default. If a required title were
    // not enforced, this would be the one field standing between an empty click and a network
    // call — so leaving it blank and nothing else is what isolates the claim.
    fillUrl("https://fonts.test/founders");
    submit();

    expect(create).not.toHaveBeenCalled();
    // The browser's own constraint validation reports the field invalid, rather than this
    // component's submit handler ever running. `validity.valid` is a native DOM property, not
    // a jest-dom matcher — this package does not set jest-dom up.
    const title = screen.getByLabelText("Title", { exact: false }) as HTMLInputElement;
    expect(title.validity.valid).toBe(false);
  });

  it("shows the server's own refusal rather than blaming the network", async () => {
    // The 1.33.1 defect: `use-submit.ts` recognised only `ApiError`, the Operations Hub's
    // class, so a BrandFactory `AppError` — a real, fast, correct refusal from the Hono server —
    // fell through to "Could not reach the API. Check that the backend is running." This asserts
    // the form surfaces the server's own sentence instead, for the transport it actually uses.
    const create = vi.fn().mockRejectedValue(new AppError("title: Too small", "VALIDATION", 400));
    setup(create);

    fillTitle("Founders Grotesk");
    fillUrl("https://fonts.test/founders");

    await act(async () => {
      submit();
    });

    expect(create).toHaveBeenCalled();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("title: Too small");
    expect(screen.queryByText(/could not reach the api/i)).toBeNull();
  });
});
