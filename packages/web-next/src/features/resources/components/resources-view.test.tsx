import type { BrandResource } from "@brandfactory/shared";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/api/bf-client";

import { useResourceMutations, useResources } from "../hooks";
import { ResourcesView } from "./resources-view";

/**
 * Three claims, and each fails **silently** in a browser pass:
 *
 * - The group order is the enum's declared order, not the order rows arrived in and not
 *   alphabetical — `font, image, icon, tool, reference, other` puts Fonts ahead of Images, which
 *   alphabetising would reverse.
 * - An empty brand renders an empty state, never a heading with nothing under it.
 * - Every row is a user-supplied URL pointing off-origin, so it has to open in a new tab with
 *   `rel="noreferrer"` — a missing `rel` renders identically and is invisible in a screenshot.
 *
 * `vi.mock("../hooks")` the same way `brand-profile.test.tsx` mocks its own hooks module: this
 * package's rule is "not the screens" (`vitest.config.ts`), so what is worth a render test is the
 * grouping and link behaviour a browser pass would not catch, not the fetch itself.
 */

vi.mock("../hooks", () => ({
  useResources: vi.fn(),
  useResourceMutations: vi.fn(),
}));

const mockedUseResources = vi.mocked(useResources);
const mockedUseResourceMutations = vi.mocked(useResourceMutations);

// A default before every test, so the tests that never touch delete do not have to know this
// hook exists. The delete tests override `remove` explicitly.
beforeEach(() => {
  mockedUseResourceMutations.mockReturnValue({
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  });
});

// The ids are zod-branded (`$brand<"BrandResourceId">`), which a plain string never satisfies —
// so the overrides take plain strings and the whole object casts through `unknown`, the same
// move `brand-profile.test.tsx` makes on its own fixture: a test fixture never runs the schema
// and does not need to satisfy it.
function resource(overrides: {
  id?: string;
  brandId?: string;
  type: BrandResource["type"];
  title?: string;
  url?: string;
  note?: string | null;
}): BrandResource {
  return {
    id: "r1",
    brandId: "b1",
    title: "Untitled resource",
    url: "https://example.test",
    note: null,
    ...overrides,
  } as unknown as BrandResource;
}

describe("ResourcesView", () => {
  it("groups by type, in the enum's declared order", () => {
    mockedUseResources.mockReturnValue({
      resources: [
        resource({ id: "r1", type: "other", title: "Misc tool" }),
        resource({ id: "r2", type: "font", title: "Founders Grotesk" }),
        resource({ id: "r3", type: "tool", title: "Figma" }),
        resource({ id: "r4", type: "image", title: "Unsplash" }),
        // A second "tool" resource. groupByType buckets with `Map.get(...) ?? []` then
        // `.set()` back — a bucket-overwrite bug (assigning a fresh array on every hit instead
        // of pushing onto the existing one) would silently drop this row, and one-resource-per-
        // type fixtures above cannot catch that class of bug.
        resource({ id: "r5", type: "tool", title: "Sketch" }),
      ],
      isLoading: false,
      error: undefined,
    });

    render(<ResourcesView brandId="b1" />);

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    // Declared order: font, image, icon, tool, reference, other. Not the arrival order above
    // (other, font, tool, image, tool), and not alphabetical (Fonts, Images, Other, Tools).
    expect(headings).toEqual(["Fonts", "Images", "Tools", "Other"]);

    // Both tool resources render as separate items under the one shared "Tools" heading — not
    // a second "Tools" heading, and not one resource silently missing.
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(4);
    const toolsList = lists[headings.indexOf("Tools")];
    expect(within(toolsList).getAllByRole("listitem")).toHaveLength(2);
    // getByRole throws if the link is missing, so reaching the assertion below is itself part
    // of the claim; the text check confirms it is the row it claims to be.
    expect(within(toolsList).getByRole("link", { name: /Figma/ }).textContent).toContain("Figma");
    expect(within(toolsList).getByRole("link", { name: /Sketch/ }).textContent).toContain(
      "Sketch",
    );
  });

  it("renders an empty state rather than a heading over nothing", () => {
    mockedUseResources.mockReturnValue({ resources: [], isLoading: false, error: undefined });

    render(<ResourcesView brandId="b1" />);

    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    screen.getByText(/no resources/i);
  });

  it("opens each link in a new tab, with rel=noreferrer", () => {
    mockedUseResources.mockReturnValue({
      resources: [
        resource({
          id: "r1",
          type: "font",
          title: "Founders Grotesk",
          url: "https://fonts.test/founders",
        }),
      ],
      isLoading: false,
      error: undefined,
    });

    render(<ResourcesView brandId="b1" />);

    const link = screen.getByRole("link", { name: /Founders Grotesk/ });
    expect(link.getAttribute("href")).toBe("https://fonts.test/founders");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("a failed delete leaves the row in place and surfaces the server's refusal", async () => {
    // On `useOutletMutations` / `useVendorMutations`'s rule (`AGENTS.md`, "Mutations"): nothing
    // here is optimistic. So the claim to test is not "removed, then restored" — the row must
    // never disappear in the first place while the request is still in flight or has failed.
    // The 1.33.1 shape applies again here: the dialog must show the server's own sentence, not a
    // generic failure, which is what `VendorResults`' `ConfirmDialog` already does for vendors.
    mockedUseResources.mockReturnValue({
      resources: [resource({ id: "r1", type: "font", title: "Founders Grotesk" })],
      isLoading: false,
      error: undefined,
    });
    const remove = vi
      .fn()
      .mockRejectedValue(new AppError("resource not found", "RESOURCE_NOT_FOUND", 404));
    mockedUseResourceMutations.mockReturnValue({ create: vi.fn(), update: vi.fn(), remove });

    const { container } = render(<ResourcesView brandId="b1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Founders Grotesk" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(remove).toHaveBeenCalledWith("r1");
    // Still there — never removed ahead of the server's answer. `container.textContent` rather
    // than `getByRole`: the open `AlertDialog` marks the rest of the page `aria-hidden` (Base
    // UI's inert trap for focus), so a role-based query for the row would fail whether or not
    // the row is actually still in the DOM — that would test the dialog's focus trap, not this.
    expect(container.textContent).toContain("Founders Grotesk");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("resource not found");
  });
});
