import { describe, expect, it } from "vitest";

import {
  completeness,
  findSection,
  gridSections,
  isWritten,
  profileToMarkdown,
  sectionAnchor,
  splitPillars,
} from "./profile";
import type { BrandProfile, ProfileBlock, ProfileSection } from "./types";

/**
 * The profile's rules, which are the half a browser pass cannot check.
 *
 * `web-next` tests logic and not screens (root `CLAUDE.md`), and every case below is a claim the
 * plan or a doc comment makes in prose — that pillars come out of the list and not the prose,
 * that an empty section is a real state, that `0 of 0` is never a fraction.
 */

function section(label: string, blocks: ProfileBlock[] = [], extra: Partial<ProfileSection> = {}) {
  return {
    id: `s-${label}`,
    label,
    kind: "aspect" as const,
    blocks,
    createdBy: "user" as const,
    updatedAt: "2026-08-14",
    ...extra,
  };
}

const paragraph = (text: string): ProfileBlock => ({ kind: "paragraph", text });
const list = (...items: string[]): ProfileBlock => ({ kind: "list", items });

describe("isWritten", () => {
  it("is false for a labelled row with no blocks — the state the suggestion chips create", () => {
    expect(isWritten(section("Voice & tone"))).toBe(false);
  });

  it("is false for blocks holding only whitespace", () => {
    expect(isWritten(section("Voice & tone", [paragraph("   "), list(" ", "")]))).toBe(false);
  });

  it("is true once anything says something", () => {
    expect(isWritten(section("Voice & tone", [paragraph("Plainspoken.")]))).toBe(true);
    expect(isWritten(section("Voice & tone", [list("Never: exclamation marks")]))).toBe(true);
  });
});

describe("findSection", () => {
  it("matches through punctuation, so a row typed TLDR is still the TL;DR", () => {
    const sections = [section("TLDR", [paragraph("A bakery.")])];
    expect(findSection(sections, "TL;DR")?.label).toBe("TLDR");
  });

  it("does not invent equivalences between different words", () => {
    expect(findSection([section("Voice and tone")], "Voice & tone")).toBeUndefined();
  });
});

describe("sectionAnchor", () => {
  it("keeps word boundaries as hyphens rather than collapsing the label", () => {
    expect(sectionAnchor(section("Voice & tone"))).toBe("voice-tone");
    expect(sectionAnchor(section("TL;DR"))).toBe("tl-dr");
  });

  it("does not leave a leading or trailing hyphen", () => {
    expect(sectionAnchor(section("  ¡Messaging!  "))).toBe("messaging");
  });

  it("keeps non-Latin labels rather than collapsing them to nothing", () => {
    // The `\p{L}` rule: an ASCII class would strip every character here, and two unrelated
    // sections would then share one anchor.
    expect(sectionAnchor(section("トーン"))).toBe("トーン");
  });

  it("falls back to the row id when a label has nothing sluggable in it", () => {
    expect(sectionAnchor(section("—", [], { id: "abc" }))).toBe("section-abc");
  });
});

describe("splitPillars", () => {
  it("takes pillars from the list and leaves the surrounding paragraph as prose", () => {
    const pillarSection = section("Content pillars", [
      list("Behind the pass", "The room at six"),
      paragraph("We do not post about the competition."),
    ]);
    const { pillars, prose } = splitPillars(pillarSection);
    expect(pillars).toEqual(["Behind the pass", "The room at six"]);
    expect(prose).toHaveLength(1);
  });

  it("gives a section written as one paragraph no pillars at all", () => {
    const { pillars, prose } = splitPillars(
      section("Content pillars", [paragraph("Mostly the room, sometimes the sourcing.")]),
    );
    expect(pillars).toEqual([]);
    expect(prose).toHaveLength(1);
  });

  it("drops blank items and caps the strip", () => {
    const { pillars } = splitPillars(
      section("Content pillars", [
        list("One", "  ", "Two", "Three", "Four", "Five", "Six", "Seven"),
      ]),
    );
    expect(pillars).toEqual(["One", "Two", "Three", "Four", "Five", "Six"]);
  });

  it("answers empty for a brand with no such section", () => {
    expect(splitPillars(undefined)).toEqual({ pillars: [], prose: [] });
  });
});

describe("gridSections", () => {
  const sections = [
    section("TL;DR", [paragraph("A bakery.")], { kind: "synthesis" }),
    section("Overview", [paragraph("Founded 2024.")], { kind: "synthesis" }),
    section("Values & positioning", [list("Craft")]),
    section("Content pillars", [list("The room")]),
    section("Messaging frameworks", [paragraph("One line.")]),
    section("Target audience", [paragraph("Locals.")]),
    section("Voice & tone"),
  ];

  it("excludes the three sections that have a band of their own", () => {
    const labels = gridSections(sections).map((s) => s.label);
    expect(labels).not.toContain("TL;DR");
    expect(labels).not.toContain("Overview");
    expect(labels).not.toContain("Content pillars");
  });

  it("keeps Values & positioning, which no band reads any more", () => {
    // The pillar band used to render this row under a second name. It is an ordinary section
    // now, so the grid is the one place it appears — and a grid that dropped it would leave the
    // brand's positioning nowhere on the page at all.
    expect(gridSections(sections).map((s) => s.label)).toContain("Values & positioning");
  });

  it("excludes empty rows, which the footer reports instead", () => {
    expect(gridSections(sections).map((s) => s.label)).not.toContain("Voice & tone");
  });

  it("orders by the curated taxonomy, not by the order the API returned", () => {
    // `Target audience` sits ahead of `Values & positioning`, which sits ahead of
    // `Messaging frameworks`, in SUGGESTED_SECTIONS — despite arriving in another order here.
    expect(gridSections(sections).map((s) => s.label)).toEqual([
      "Target audience",
      "Values & positioning",
      "Messaging frameworks",
    ]);
  });

  it("sorts a brand's own labels after the curated ones, and among themselves by name", () => {
    const custom = [
      section("Zoning rules", [paragraph("x")]),
      section("Ambience", [paragraph("y")]),
      section("Target audience", [paragraph("z")]),
    ];
    expect(gridSections(custom).map((s) => s.label)).toEqual([
      "Target audience",
      "Ambience",
      "Zoning rules",
    ]);
  });
});

describe("completeness", () => {
  it("counts written rows and names the empty ones in order", () => {
    const state = completeness([
      section("TL;DR", [paragraph("A bakery.")]),
      section("Voice & tone"),
      section("Content pillars"),
    ]);
    expect(state).toEqual({ written: 1, total: 3, unwritten: ["Voice & tone", "Content pillars"] });
  });

  it("reports 0 of 0 for a brand with no sections, for the caller to render as words", () => {
    expect(completeness([])).toEqual({ written: 0, total: 0, unwritten: [] });
  });
});

describe("profileToMarkdown", () => {
  const profile: BrandProfile = {
    id: "b1",
    name: "Harbour Table",
    description: null,
    websiteUrl: "https://harbourtable.sg",
    updatedAt: "2026-08-14",
    research: null,
    colours: [{ label: "Deep harbour", value: "#12303a" }],
    typefaces: [{ label: "Söhne", note: null }],
    sections: [
      section("TL;DR", [paragraph("A harbourside dining room.")]),
      section("Values & positioning", [list("Provenance", "The room")]),
      section("Voice & tone"),
    ],
  };

  it("writes headings, paragraphs and dashed lists", () => {
    const markdown = profileToMarkdown(profile);
    expect(markdown).toContain("# Harbour Table");
    expect(markdown).toContain("## TL;DR");
    expect(markdown).toContain("A harbourside dining room.");
    expect(markdown).toContain("- Provenance");
  });

  it("omits an empty section rather than pasting a bare heading", () => {
    expect(profileToMarkdown(profile)).not.toContain("Voice & tone");
  });

  it("carries the colours and the typefaces", () => {
    const markdown = profileToMarkdown(profile);
    expect(markdown).toContain("- Deep harbour — #12303a");
    expect(markdown).toContain("- Söhne");
  });
});
