import {
  DRAFT_TARGET_MAX_CHARS,
  SUGGESTED_SECTIONS,
  VISUAL_GUIDELINES_SECTION_LABEL,
} from '@brandfactory/shared'
import type { SectionSearchRequest } from './port'

// ---------------------------------------------------------------------------
// The find prompt — written against a report that actually came back
// ---------------------------------------------------------------------------
//
// Stage 1 asks for **a report**, not for our JSON. Decision 5 rejects
// `response_format` against the search vendor explicitly: it couples our
// guideline schema to a surface already flagged as churning, it throws away the
// report a human might want to read, and it puts schema-shaping work on the
// model chosen for *search* rather than the one the user configured for
// *writing*. 3D shapes; this finds.
//
// The headings come from `SUGGESTED_SECTIONS` rather than being retyped, so the
// report's shape and the editor's suggestions cannot drift apart — 3D keys
// drafts to these same labels.
//
// **Three lines here are load-bearing, and 3A is why:**
//
//   "omit … rather than guess"   the live run's `Visual guidelines` opened with
//                                "Limited explicit information" instead of
//                                inventing a palette. Keep the instruction that
//                                produced that.
//   "not hex values"             2E gave colours a control. A machine writing
//                                them back as prose is the two-places-for-one-
//                                fact failure this product opens by describing.
//                                (3A's report contained zero hex, so this is
//                                prophylactic — and cheap.)
//   "say so plainly and stop"    the honest route to `NO_FINDINGS`. A one-page
//                                holding site should produce a short report
//                                that says so, not five sections of inference.

export function buildResearchPrompt(input: { brandName: string; websiteUrl: string }): string {
  const headings = SUGGESTED_SECTIONS.map((s) => `## ${s.label}`).join('\n')

  // The summary headings lead the report — a reader opening 68,000 characters
  // wants the top of it to say what the brand is — but they are *written from*
  // everything below, not researched separately. Saying so is the difference
  // between a TL;DR that condenses the report and one that repeats the About
  // page, and it costs a line.
  const synthesis = SUGGESTED_SECTIONS.filter((s) => s.kind === 'synthesis').map((s) => s.label)

  const rules = [
    "- Cite a source for every factual claim. Prefer the brand's own site and its own words; quote them where you can.",
    `- Under "${VISUAL_GUIDELINES_SECTION_LABEL}", describe the thinking and the references — not hex values.`,
    "- Keep each section tight. Prefer the brand's own phrasing over your summary of it.",
    ...(synthesis.length > 0
      ? [
          `- ${synthesis.map((l) => `"${l}"`).join(' and ')} come first but are written last: they summarise everything below them. Omit them only if the report itself has nothing to summarise.`,
        ]
      : []),
    '- If the site gives you too little to work with, say so plainly and stop. Do not fill the gaps.',
  ].join('\n')

  return `Research the brand "${input.brandName}" (${input.websiteUrl}) and write a brand profile as a markdown report.

Use these headings, in this order, and omit a heading entirely rather than guess at what belongs under it:

${headings}

Rules:
${rules}`
}

// ---------------------------------------------------------------------------
// The section-search prompt — one section, synchronously, cents not dollars
// ---------------------------------------------------------------------------
//
// The auto-fill counterpart (guideline auto-fill Phase A). Same vendor, a
// different job: not a report for a human to read but **one section body a
// TipTap row is about to receive** — so where the deep prompt asks for
// headings, this one forbids them, and where the deep report's `[n]` markers
// become citation chips (1.18.0), here they would render as debris and are
// excluded by instruction (and stripped again by the shaper's post-process,
// belt and braces).
//
// It keeps the deep prompt's load-bearing rules in section-sized form —
// hex stays out, and an honest `no-material` outcome stays reachable
// (decision 7). The A0 spike's captured run
// (`fixtures/section-search-completed.json`) followed all of them.

/**
 * What the vendor must return when it has nothing grounded to write —
 * **a sentinel, not a plain-language refusal.**
 *
 * The deep prompt's *"say so plainly and stop"* is right for a report a human
 * reads: a paragraph explaining that the site gave it too little is a useful
 * artefact. Reused verbatim for a section, it produced the Phase E live pass's
 * ship-blocker. Asked for a `Franchise fee schedule` the brand does not have,
 * `sonar-pro` obeyed perfectly and answered:
 *
 *   "I cannot find any information on the … website … that defines a franchise
 *    model, franchise fees, royalty structure … Because no franchise-related
 *    details are provided by the brand itself, there is not enough grounded
 *    information to write a … section without inventing or extrapolating terms."
 *
 * — 600 characters of honest prose, which is *non-empty content*. The service
 * classified it `ok`, and the client was one click from pasting the model's
 * apology into a guideline row, attributing it to the agent, and toasting
 * "drafted from 10 sources". The refusal was right; only its **shape** made it
 * indistinguishable from a section.
 *
 * A sentinel makes the distinction machine-checkable, which is the same move
 * `shapeSectionFromReport` already makes by instructing an *empty* `markdown`
 * — there the schema gives the model a compliant way to say nothing; a chat
 * completion has none, so one is defined here.
 */
export const SECTION_NO_MATERIAL_SENTINEL = 'NO_MATERIAL'

export function buildSectionSearchPrompt(
  input: Pick<
    SectionSearchRequest,
    'brandName' | 'websiteUrl' | 'label' | 'description' | 'existingLabels' | 'kind' | 'maxChars'
  >,
): string {
  const maxChars = input.maxChars ?? DRAFT_TARGET_MAX_CHARS
  const synthesis = input.kind === 'synthesis'

  const lines = [
    `Research the brand "${input.brandName}" (${input.websiteUrl}) and write the "${input.label}" section of its brand guidelines.`,
  ]
  if (input.description) {
    lines.push('', `${input.label}: ${input.description}`)
  }
  lines.push(
    '',
    'Rules:',
    `- Write the section body only — no heading, no preamble, at most ${maxChars} characters of markdown.`,
    "- Ground every claim in what you find about this brand. Prefer the brand's own site and its own words.",
    '- Do not put citation markers like [1] or [2] in the text.',
    '- Do not include hex colour values.',
  )
  if (input.existingLabels.length > 0) {
    // **The one line that inverts, and the reason `kind` exists.** For an
    // aspect, naming the neighbours keeps the section in its lane. For a
    // summary, the same sentence forbids it from mentioning the very things it
    // exists to compress — so the more a brand has written, the emptier its
    // TL;DR would come back. Both halves name the same list; only the
    // instruction about it flips.
    lines.push(
      synthesis
        ? `- This brand's guidelines already have sections for: ${input.existingLabels.join(', ')}. This section sits above them and summarises across all of them — draw on that ground freely, but write it as one coherent whole rather than a list of the other sections.`
        : `- This brand's guidelines already have sections for: ${input.existingLabels.join(', ')}. Do not restate what belongs there.`,
    )
  }
  lines.push(
    `- If you cannot find enough about this brand to write this section, reply with exactly ${SECTION_NO_MATERIAL_SENTINEL} and nothing else — no explanation, no apology. Do not fill the gaps.`,
  )
  return lines.join('\n')
}
