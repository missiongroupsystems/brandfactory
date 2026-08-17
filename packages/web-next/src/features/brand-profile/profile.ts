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
 * The section the pillar band renders.
 *
 * **Brand pillars are the brand's values** — settled in `docs/plans/brand-profiles.md` §2 — so
 * the band reads the row the product already has instead of adding a ninth section for the same
 * idea.
 *
 * A literal rather than an import because `shared` exports named constants only for the four
 * labels something addresses by name (`TL;DR`, `Overview`, `Visual guidelines`,
 * `Content pillars`), and this is now a fifth. Promote it there if a second caller appears; every
 * comparison below goes through `sameSectionLabel`, so the punctuation tolerance is the same
 * either way.
 */
export const PILLARS_SECTION_LABEL = "Values & positioning";

/**
 * How many pillars the band draws before it stops.
 *
 * A display cap, not a bound on the data: the strip is a row of cards and a brand that listed
 * nine values gets six cards and its own prose beneath them. `shared`'s `MAX_CONTENT_PILLARS`
 * (12) is the *planner's* limit on what it will accept, which is a different question.
 */
export const MAX_PILLAR_CARDS = 6;

/** The four labels the page renders in a band of their own, so the grid must not repeat them. */
const BANDED_LABELS = [
  TLDR_SECTION_LABEL,
  OVERVIEW_SECTION_LABEL,
  PILLARS_SECTION_LABEL,
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
 * The pillar band's two halves, from one section.
 *
 * `Values & positioning` deliberately holds two shapes: a list of values, and a paragraph saying
 * how the brand differs from the alternatives. A reader that flattened both into cards would
 * promote the positioning paragraph to a fourth pillar — a wrong statement rendered confidently,
 * which is the failure the plan's §2.1 exists to prevent.
 *
 * So **list items become cards and paragraphs stay prose**. A brand that wrote its values as one
 * paragraph gets no strip and a normal prose section, which is also the nudge to press Return
 * three times — exactly how `brandContentPillars()` already behaves for the planner.
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
 * - **The four banded labels are excluded.** TL;DR, Overview, the pillars and the content pillars
 *   each already have a band of their own further up the page. `Values & positioning` in
 *   particular must not reappear here — one row, one place on the page (plan §4.3).
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
