import { SUGGESTED_SECTIONS } from '@brandfactory/shared'

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

  return `Research the brand "${input.brandName}" (${input.websiteUrl}) and write a brand profile as a markdown report.

Use these headings, in this order, and omit a heading entirely rather than guess at what belongs under it:

${headings}

Rules:
- Cite a source for every factual claim. Prefer the brand's own site and its own words; quote them where you can.
- Under "${SUGGESTED_SECTIONS[3].label}", describe the thinking and the references — not hex values.
- Keep each section tight. Prefer the brand's own phrasing over your summary of it.
- If the site gives you too little to work with, say so plainly and stop. Do not fill the gaps.`
}
