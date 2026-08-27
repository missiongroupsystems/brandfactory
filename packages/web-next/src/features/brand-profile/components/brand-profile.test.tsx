import type { BrandWithSections } from "@brandfactory/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { toBrandProfile } from "../map";
import { brandPillars } from "../pillars";
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
 * paragraph stays prose) holds.
 *
 * **The fixture is now a server response, not a sample.** It is a `BrandWithSections` put through
 * the real mapper, so this file exercises `docToBlocks` and `toBrandProfile` on the way to the
 * screen rather than handing the components a hand-authored view model — which would assert the
 * layout against a shape the API cannot produce.
 *
 * `getBy*` throws when it finds nothing, so each query is itself the assertion —
 * `@testing-library/jest-dom` is a dependency of this package but is not wired into
 * `test-setup.ts`, and one screen test is not the reason to wire it in.
 */

const doc = (value: unknown) => value as BrandWithSections["sections"][number]["body"];

const prose = (...paragraphs: string[]) =>
  doc({
    type: "doc",
    content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  });

const section = (label: string, body: BrandWithSections["sections"][number]["body"], id: string) =>
  ({
    id,
    brandId: "b1",
    label,
    body,
    priority: 100,
    createdBy: "user",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-12T09:00:00.000Z",
  }) as unknown as BrandWithSections["sections"][number];

const SOURCE = {
  id: "b1",
  workspaceId: "w1",
  name: "Acme Bakehouse",
  description: null,
  websiteUrl: "https://acmebakehouse.sg",
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-08-14T09:00:00.000Z",
  sections: [
    section("TL;DR", prose("A neighbourhood bakery that keeps its own hours."), "s1"),
    section(
      "Values & positioning",
      doc({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Provenance over provenance-speak — we name the mill, we do not lecture",
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "We sit between the hotel patisseries and the kopitiam counters.",
              },
            ],
          },
        ],
      }),
      "s2",
    ),
    section("Overview", prose("Six benches, one oven, and a queue by seven."), "s3"),
    section("Voice & tone", prose("Warm, short sentences. Never twee."), "s4"),
  ],
} as unknown as BrandWithSections;

vi.mock("../hooks", () => ({
  useBrandProfile: () => ({
    profile: toBrandProfile(SOURCE, null),
    brandId: SOURCE.id,
    source: SOURCE,
    isLoading: false,
    error: undefined,
  }),
  // The two sheets are mounted by the screen whether or not they are open, so the mock has to
  // answer this as well. Nothing below opens one — this file asserts the reading surface, and
  // the writes' own rule (build the payload from a fresh read) is tested in `guidelines.test.ts`
  // where it can be asserted rather than clicked.
  useBrandProfileMutations: () => ({
    saveGuidelines: vi.fn(),
    updateBrand: vi.fn(),
  }),
}));

// `BrandProfileScreen` reads decks for the `DecksBand` and the *On this page* count (2E) — mocked
// empty so this fixture's brand shows none, on the same reasoning `useBrandProfile` above is
// mocked: a real `useDecks` here would fire an actual `fetch` against `bf`, which this file has no
// business exercising.
vi.mock("@/features/decks/hooks", () => ({
  useDecks: () => ({ decks: [], isLoading: false, error: undefined }),
}));

describe("BrandProfileScreen", () => {
  it("renders the brand the server answered with", () => {
    render(<BrandProfileScreen />);
    screen.getByRole("heading", { level: 1, name: "Acme Bakehouse" });
    // The badge that used to sit beside it is gone with the fixtures. Its absence is the claim:
    // a page still saying "Sample content" over real data is the bug that badge existed to avoid,
    // pointed the other way.
    expect(screen.queryByText("Sample content")).toBeNull();
  });

  it("puts the bands in reading order", () => {
    render(<BrandProfileScreen />);
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings.slice(0, 3)).toEqual(["TL;DR", "Brand pillars", "Overview"]);
  });

  it("renders Values & positioning as its own section, list and paragraph both", () => {
    render(<BrandProfileScreen />);
    screen.getByRole("heading", { name: "Values & positioning" });
    // A list item, because the section wrote it as one — the distinction `docToBlocks` exists to
    // preserve, and it survives the move out of the band. The clause after the em dash stays on
    // the item rather than being split off it: this is prose now, not a card with a subtitle.
    expect(
      screen
        .getByText("Provenance over provenance-speak — we name the mill, we do not lecture")
        .closest("li"),
    ).not.toBeNull();
    // Prose, because the section wrote it as a paragraph. A list item here would be the bug.
    expect(screen.getByText(/We sit between the hotel patisseries/).closest("li")).toBeNull();
  });

  it("fills the pillar band from the hardcoded sample, and never from the values section", () => {
    render(<BrandProfileScreen />);
    // The regression the band was built to fix: a heading reading `Brand pillars` over the
    // `Values & positioning` row. The band draws its own cards now, so the section it used to
    // borrow must still sit outside it.
    const band = screen.getByRole("heading", { name: /Brand pillars/ }).closest("section");
    expect(band).not.toBeNull();
    expect(band?.textContent).not.toContain("Provenance over provenance-speak");
    expect(band?.textContent).not.toContain("We sit between the hotel patisseries");
    // One card per sample pillar, and the `Sample` note beside the heading. The note is the
    // whole licence for rendering invented words under a real brand's name — a band that lost it
    // would read as five values this bakery had declared.
    expect(within(band as HTMLElement).getAllByRole("listitem")).toHaveLength(
      brandPillars().length,
    );
    expect(band?.textContent).toContain("Sample");
    expect(band?.textContent).toContain("Craft over volume");
  });

  it("states the fraction rather than a bare count", () => {
    render(<BrandProfileScreen />);
    // Twice on purpose — the identity line and the footer — and they must agree, which is why
    // both read the same `completeness()`.
    expect(screen.getAllByText("4 of 4 sections written")).toHaveLength(2);
  });
});
