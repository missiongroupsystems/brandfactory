import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SAMPLE_PROFILES } from "../fixtures";
import { sampleProfileFor } from "../hooks";
import { BrandProfileScreen } from "./brand-profile";

/**
 * A smoke test for the screen, and **it is here because a browser pass was not possible.**
 *
 * The shell sits behind sign-in and the only door on that page is a token field, so this work
 * could not be checked the way 1.31.0's screens were. `next build` proves the route compiles and
 * prerenders, but the profile subtree sits behind `AuthBoundary` and that render never reaches
 * it. This file reaches it.
 *
 * Deliberately thin, and not the start of a screen-test habit — the package's rule is that it
 * tests logic and not screens (`vitest.config.ts`). What is asserted is only what a person
 * opening the page checks in the first five seconds: it renders, the bands are in reading order,
 * and the one rule the layout would be wrong without (cards come from the list, the positioning
 * paragraph stays prose) holds against real fixture data.
 *
 * `getBy*` throws when it finds nothing, so each query is itself the assertion —
 * `@testing-library/jest-dom` is a dependency of this package but is not wired into
 * `test-setup.ts`, and one screen test is not the reason to wire it in.
 */

/**
 * An id chosen so `sampleProfileFor` resolves to the **fully written** sample — the page with
 * every band on it. The resolver hashes the id (see its note: the switcher would look broken if
 * every brand showed one profile), so a test that assumed the first fixture would be asserting
 * against whichever sample the hash happened to pick.
 */
const brand = { id: "bf000000-0000-4000-8000-000000000003", name: "Acme Bakehouse" };

vi.mock("@/features/brands/active-brand", () => ({
  useActiveBrand: () => ({
    brand,
    brands: [brand],
    workspaceId: "w1",
    isLoading: false,
    error: undefined,
    select: vi.fn(),
  }),
}));

describe("BrandProfileScreen", () => {
  it("resolves the fully written sample for this id", () => {
    // Guards every assertion below: if the hash ever moves, this fails first and says why.
    expect(sampleProfileFor(brand.id)).toBe(SAMPLE_PROFILES[0]);
  });

  it("renders the brand's own name over sample content", () => {
    render(<BrandProfileScreen />);
    // The identity is the shell's real brand; the words below it are the fixture, and the badge
    // says so. Both halves matter — see `useBrandProfile`.
    screen.getByRole("heading", { level: 1, name: "Acme Bakehouse" });
    screen.getByText("Sample content");
  });

  it("puts the bands in reading order", () => {
    render(<BrandProfileScreen />);
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings.slice(0, 3)).toEqual(["TL;DR", "Brand pillars", "Overview"]);
  });

  it("shows the values as pillar cards and never the positioning paragraph as one", () => {
    render(<BrandProfileScreen />);
    // A card, because the section wrote it as a list item — and the name is split off its
    // supporting clause at the em dash, which is what makes a strip of cards readable.
    expect(screen.getByText("Provenance over provenance-speak").closest("li")).not.toBeNull();
    screen.getByText("we name the boat, we do not lecture");
    // Prose, because the section wrote it as a paragraph. A list item here would be the bug.
    expect(screen.getByText(/We sit between the hotel dining rooms/).closest("li")).toBeNull();
  });

  it("does not repeat the pillar section in the grid below", () => {
    render(<BrandProfileScreen />);
    expect(screen.queryByRole("heading", { name: "Values & positioning" })).toBeNull();
  });

  it("states the fraction rather than a bare count", () => {
    render(<BrandProfileScreen />);
    // Twice on purpose — the identity line and the footer — and they must agree, which is why
    // both read the same `completeness()`.
    expect(screen.getAllByText("8 of 8 sections written")).toHaveLength(2);
  });
});
