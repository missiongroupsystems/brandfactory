import {
  CONTENT_PILLARS_SECTION_LABEL,
  OVERVIEW_SECTION_LABEL,
  TLDR_SECTION_LABEL,
  sameSectionLabel,
  suggestedSectionIndex,
} from "@brandfactory/shared";

import type { BrandProfile, ProfileBlock, ProfileSection } from "./types";

/**
 * The rules that decide what the profile page shows where.
 *
 * Pure, and separated from the components on purpose: this is the half a browser pass cannot
 * check, and it is the half that carries the plan's arguments. `web-next` tests logic and not
 * screens (root `CLAUDE.md`), so everything in this file has a test in `profile.test.ts`.
 *
 * **The taxonomy itself is not here.** Which labels are known, what each one means, which read
 * across the brand, and where each sits in the curated order all live in `@brandfactory/shared`'s
 * `canonical-sections.ts`, and this file *calls* it. A second opinion about whether `TLDR` is the
 * `TL;DR` is the drift that file exists to prevent.
 */

/**
 * **The pillar band reads no section, and `Values & positioning` is not it.**
 *
 * `docs/plans/brand-profiles.md` §2 equated the two — brand pillars *are* the brand's values —
 * and the band therefore rendered that row under a second name. Seen on real data, the equation
 * does not hold: `Values & positioning`'s own description is *"what the brand stands for **and how
 * it differs from the alternatives**"*, which is two questions, and the positioning half is a
 * competitive-set argument that nothing about it reads as a pillar. A band headed *Brand pillars*
 * and subtitled *from Values & positioning* was the page admitting as much.
 *
 * So the two are separated. `Values & positioning` is now an ordinary section — one card in the
 * grid, under its own label, beside `Voice & tone` — and **Brand pillars is a placeholder** until
 * the product decides what a pillar is and where it is stored. Nothing addresses a
 * `Brand pillars` label, no such row is written, and the band renders the same stated-empty box
 * for every brand.
 *
 * That is why there is no `PILLARS_SECTION_LABEL` here any more. Re-introducing one is the change
 * that makes the band live; it belongs with the product decision, not ahead of it.
 */

/**
 * How many pillars a strip draws before it stops.
 *
 * A display cap, not a bound on the data: a brand that listed nine content pillars gets six chips
 * and no error. `shared`'s `MAX_CONTENT_PILLARS` (12) is the *planner's* limit on what it will
 * accept, which is a different question.
 */
export const MAX_PILLAR_CARDS = 6;

/** The three labels the page renders in a band of their own, so the grid must not repeat them. */
const BANDED_LABELS = [
  TLDR_SECTION_LABEL,
  OVERVIEW_SECTION_LABEL,
  CONTENT_PILLARS_SECTION_LABEL,
];

/** The section a label names, or `undefined`. Punctuation-tolerant, via `shared`. */
export function findSection(
  sections: readonly ProfileSection[],
  label: string,
): ProfileSection | undefined {
  return sections.find((section) => sameSectionLabel(section.label, label));
}

/**
 * Does this section actually say anything?
 *
 * The profile's stand-in for `shared`'s `sectionBodyToLine(body) !== null`, which needs a
 * ProseMirror document. Same rule, one level flatter: a row with no blocks, or with nothing but
 * whitespace in them, is **labelled and empty** — a state the product creates deliberately and
 * must never render as though it were written.
 */
export function isWritten(section: ProfileSection): boolean {
  return section.blocks.some((block) =>
    block.kind === "paragraph"
      ? block.text.trim().length > 0
      : block.items.some((item) => item.trim().length > 0),
  );
}

/**
 * A stable id for a section's heading, so every band on the page is linkable.
 *
 * Anchors are the reason the brand book layout won (plan §3): "here is our voice section" should
 * be a link somebody pastes into Slack, not an instruction to scroll.
 *
 * **Not `normaliseSectionLabel`**, which strips punctuation *and* the spaces with it — every
 * label would collapse to one unreadable word (`voicetone`), and two labels differing only in
 * punctuation would collide into one duplicate `id`. This keeps the word boundaries as hyphens.
 *
 * `\p{L}\p{N}` and not `a-z0-9`, for the reason `canonical-sections.ts` gives at length: an ASCII
 * class does not keep letters, it keeps English, and every label written in Japanese or Cyrillic
 * would slugify to the empty string and collide. When a label has nothing sluggable in it at all,
 * the row id carries the anchor instead — ugly, unique, and never a broken link.
 */
export function sectionAnchor(section: ProfileSection): string {
  const slug = section.label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : `section-${section.id}`;
}

/**
 * A pillar section's two halves — the declared items, and everything else it says.
 *
 * `Content pillars` is the one caller. The section deliberately holds two shapes: a list of
 * themes, and whatever prose the brand wrote around them. A reader that flattened both into chips
 * would promote a sentence of context into a fourth pillar — a wrong statement rendered
 * confidently, which is the failure the plan's §2.1 exists to prevent.
 *
 * So **list items become pillars and paragraphs stay prose**. A brand that wrote its themes as one
 * paragraph gets no strip at all, which is also the nudge to press Return three times — exactly
 * how `brandContentPillars()` already behaves for the planner.
 */
export function splitPillars(section: ProfileSection | undefined): {
  pillars: string[];
  prose: ProfileBlock[];
} {
  if (!section) return { pillars: [], prose: [] };
  const pillars = section.blocks
    .filter((block): block is Extract<ProfileBlock, { kind: "list" }> => block.kind === "list")
    .flatMap((block) => block.items)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, MAX_PILLAR_CARDS);
  const prose = section.blocks.filter((block) => block.kind === "paragraph");
  return { pillars, prose };
}

/**
 * The sections the two-column grid renders, in reading order.
 *
 * Two rules, and both are about not saying the same thing twice:
 *
 * - **The three banded labels are excluded.** TL;DR, Overview and the content pillars each already
 *   have a band of their own on the page. `Values & positioning` used to be a fourth and is not:
 *   the pillar band reads no section now, so the grid is where that row belongs and the rule it
 *   protects — one row, one place on the page (plan §4.3) — is what puts it there.
 * - **Empty rows are excluded.** A labelled section with nothing in it is reported once, in the
 *   footer, where it comes with something to do about it. Six grey cards saying nothing is not a
 *   brand book.
 *
 * Ordered by the curated taxonomy — `suggestedSectionIndex` returns `Infinity` for a label the
 * product never proposed, so a brand's own inventions sort to the end and then among themselves
 * by label. A comparator input, never a stored index: see that function's own warning.
 */
export function gridSections(sections: readonly ProfileSection[]): ProfileSection[] {
  return sections
    .filter((section) => !BANDED_LABELS.some((label) => sameSectionLabel(section.label, label)))
    .filter(isWritten)
    .sort((a, b) => {
      const left = suggestedSectionIndex(a.label);
      const right = suggestedSectionIndex(b.label);
      // Compared before subtracting, because two custom labels are both `Infinity` and
      // `Infinity - Infinity` is `NaN` — a comparator answering `NaN` leaves the order
      // engine-defined, so a brand's own sections would shuffle rather than sort by name.
      if (left !== right) return left - right;
      return a.label.localeCompare(b.label);
    });
}

export interface ProfileCompleteness {
  written: number;
  total: number;
  /** The labels of the rows that exist and say nothing, in the order the brand holds them. */
  unwritten: string[];
}

/**
 * How much of this brand is actually written down.
 *
 * The flattened twin of `shared`'s `brandContextState`, and it answers the same way on the same
 * brand — including the case that matters most: **a brand with no sections at all is
 * `0 of 0`**, which the footer must render as *no context yet* and never as a fraction. `0 of 0`
 * invites the reader to look for the rows it is counting, and there are none.
 */
export function completeness(sections: readonly ProfileSection[]): ProfileCompleteness {
  const unwritten = sections.filter((section) => !isWritten(section)).map((s) => s.label);
  return {
    written: sections.length - unwritten.length,
    total: sections.length,
    unwritten,
  };
}

/**
 * The whole brand as Markdown, for the clipboard.
 *
 * The first-class action of the page (plan §5.2): whatever tool a marketer is actually using
 * today, this is what they paste into it. Deliberately plain — headings, paragraphs and dashes —
 * because the destination is as likely to be a chat box as an editor.
 *
 * Empty sections are omitted rather than emitted as bare headings: a pasted brief that lists six
 * headings with nothing under them reads as a brand that said nothing, rather than as a brand
 * that has not filled those in yet.
 */
export function profileToMarkdown(profile: BrandProfile): string {
  const lines: string[] = [`# ${profile.name}`];
  if (profile.websiteUrl) lines.push("", profile.websiteUrl);

  for (const section of profile.sections) {
    if (!isWritten(section)) continue;
    lines.push("", `## ${section.label}`);
    for (const block of section.blocks) {
      if (block.kind === "paragraph") {
        if (block.text.trim()) lines.push("", block.text.trim());
        continue;
      }
      const items = block.items.map((item) => item.trim()).filter(Boolean);
      if (items.length > 0) lines.push("", ...items.map((item) => `- ${item}`));
    }
  }

  if (profile.colours.length > 0) {
    lines.push("", "## Colours", "");
    lines.push(...profile.colours.map((colour) => `- ${colour.label} — ${colour.value}`));
  }
  if (profile.typefaces.length > 0) {
    lines.push("", "## Typefaces", "");
    lines.push(
      ...profile.typefaces.map((face) => `- ${face.label}${face.note ? ` — ${face.note}` : ""}`),
    );
  }

  return `${lines.join("\n")}\n`;
}
