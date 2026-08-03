import { generateObject, jsonSchema } from 'ai'
import { z } from 'zod'
import type { LLMProvider, LLMProviderSettings } from '@brandfactory/adapter-llm'
import {
  DRAFT_TARGET_MAX_CHARS,
  type ResearchDraft,
  type ResearchSource,
} from '@brandfactory/shared'
import { markdownToDraftBody } from './markdown'
import { resolveCitedSources } from './shape'

// ---------------------------------------------------------------------------
// Path R of guideline auto-fill: one section, extracted from the stored report
// ---------------------------------------------------------------------------
//
// `shapeResearchIntoSections` narrowed to a single label. The report is already
// paid for and sitting on the job row; this asks the **workspace's own
// configured model** (the 3D decision, unchanged) to extract just the section
// the user clicked, rather than re-shaping all of them to keep one. Runs on the
// user's own LLM tokens — cents — which is why Path R exists even when
// `RESEARCH_PROVIDER=none`.
//
// **The label is input, not model output.** The batch shaper has clamping
// drama because the model names its sections; here the caller already owns the
// label — the row the user clicked — so the draft simply echoes it back.

/**
 * What the model may return. One body, not a list.
 *
 * **`markdown` deliberately has no `min(1)`** — an empty string is the schema's
 * honest answer for "the report has nothing solid on this", the per-section
 * form of the batch prompt's *omit rather than invent* rule. Refusing it at the
 * schema would leave the model no compliant way to say so and turn honesty into
 * `invalid-shape`.
 */
const ShapedSectionBodySchema = z.object({
  markdown: z.string(),
  /** URLs the section rests on. Resolved against the report's citations. */
  sourceUrls: z.array(z.string()).default([]),
})

/**
 * `[n]` citation markers, removed from generated section text.
 *
 * The deep report's markers become citation chips in the chat bubble (1.18.0);
 * a TipTap guideline row has no such renderer and would show them as debris —
 * decision 10 excludes them by prompt *and* strips them here, belt and braces.
 * The lookahead spares real links: `[3](https://…)` is a link whose text is
 * "3", not a marker. A bare `[3]` inside legitimate prose is eaten too — the
 * plan's accepted risk, confined to generated drafts the user is about to
 * review. Exported for Phase C, whose Path S applies the same rule to the
 * section search's output.
 */
export function stripCitationMarkers(markdown: string): string {
  return markdown.replace(/ ?\[\d+\](?!\()/g, '')
}

/**
 * Why the shaping produced what it produced — the 1.13.2 diagnosability rule,
 * in the vocabulary decision 7 gives the service:
 *
 * - `no-material` — the model answered in-schema that the report has nothing
 *   solid for this label. Not an error: the client toasts *"The research
 *   doesn't cover {label}"* instead of inventing text.
 * - `invalid-shape` — the model did not answer in the schema at all. A fact
 *   about the configured writing model, not about the brand.
 */
export type SectionShapeOutcome = 'ok' | 'no-material' | 'invalid-shape'

export interface ShapeSectionInput {
  brandName: string
  /** The section's label — the row the user clicked. Echoed onto the draft. */
  label: string
  /** The `SUGGESTED_SECTIONS` description when the label matches one. */
  description?: string
  /** Labels the guidelines already have, so the text does not restate a neighbour. */
  existingLabels: string[]
  /** The stored deep-research report, verbatim. */
  report: string
  /** The report's citations. **The only URLs the draft may cite.** */
  citations: ResearchSource[]
  llmProvider: LLMProvider
  llmSettings: LLMProviderSettings
  signal?: AbortSignal
}

export interface ShapeSectionResult {
  /** Present iff `outcome === 'ok'`. */
  draft: ResearchDraft | null
  outcome: SectionShapeOutcome
  /** Report characters handed to the model — the batch shaper's same log fact. */
  reportChars: number
}

export function buildSectionShapePrompt(input: {
  brandName: string
  label: string
  description?: string
  existingLabels: string[]
  citations: ResearchSource[]
}): string {
  const sources = input.citations.map((c) => `- ${c.url} — ${c.title}`).join('\n')

  const lines = [
    `You are extracting one brand guideline section from a long research report about the brand "${input.brandName}".`,
    '',
    `Write the "${input.label}" section only.`,
  ]
  if (input.description) {
    lines.push('', `${input.label}: ${input.description}`)
  }
  lines.push(
    '',
    'Rules, in order of importance:',
    '',
    '1. **Return an empty markdown string rather than invent.** If the report has nothing solid for this section, answer with an empty `markdown`. A missing section is honest; a padded one is a lie the user has to find.',
    `2. **Compress.** The section is 3–6 sentences, under ${DRAFT_TARGET_MAX_CHARS} characters. You are writing the version someone reads in a sidebar, not a summary of everything the report says.`,
    "3. **Quote the brand's own words** where the report gives them. Their phrasing is the asset; yours is a paraphrase of it.",
    '4. **Cite only from this list.** Every URL you put in `sourceUrls` must appear below verbatim; anything else is dropped.',
    '5. **No colour values.** Never write hex codes or RGB values — this product stores colours as structured data with their own editor. Describe the thinking and the references instead.',
    '6. **No citation markers.** Do not put markers like [1] or [2] in the text; cite through `sourceUrls` instead.',
    '7. Write plain markdown: paragraphs, and bullet lists where a list is genuinely the shape. No headings, no tables, no images.',
  )
  if (input.existingLabels.length > 0) {
    lines.push(
      '',
      `The brand's guidelines already have sections for: ${input.existingLabels.join(', ')}. Do not restate what belongs there.`,
    )
  }
  lines.push('', 'Sources available for citation:', '', sources || '- (none)')
  return lines.join('\n')
}

/**
 * Report → one draft, or an honest reason there is none.
 *
 * The same boundaries as the batch shaper, enforced here rather than trusted
 * to the prompt: sources resolve against the report's citations (invented URLs
 * dropped), markers are stripped, and a body that is empty after both is
 * `no-material` rather than a blank row. Throws only what `generateObject`
 * throws — network, provider, abort — which the caller maps the same way it
 * maps every vendor failure.
 */
export async function shapeSectionFromReport(
  input: ShapeSectionInput,
): Promise<ShapeSectionResult> {
  const reportChars = input.report.length

  // JSON Schema rather than the zod object, re-validated locally — the same
  // `ai` 4.0.20 / zod 4 mismatch (and the same distrust of unvalidated model
  // output) documented in `shape.ts`.
  const { object } = await generateObject({
    model: input.llmProvider.getModel(input.llmSettings),
    schema: jsonSchema<z.infer<typeof ShapedSectionBodySchema>>(
      z.toJSONSchema(ShapedSectionBodySchema) as Record<string, unknown>,
    ),
    system: buildSectionShapePrompt(input),
    prompt: input.report,
    abortSignal: input.signal,
  })

  const parsed = ShapedSectionBodySchema.safeParse(object)
  if (!parsed.success) {
    return { draft: null, outcome: 'invalid-shape', reportChars }
  }

  const { html, text } = markdownToDraftBody(stripCitationMarkers(parsed.data.markdown))
  // Empty by instruction, whitespace, or markers-only: all mean the report gave
  // the model nothing for this label. One outcome, because the client has one
  // honest toast for it.
  if (!text.trim()) {
    return { draft: null, outcome: 'no-material', reportChars }
  }

  return {
    draft: {
      label: input.label,
      html,
      text,
      sources: resolveCitedSources(parsed.data.sourceUrls, input.citations),
    },
    outcome: 'ok',
    reportChars,
  }
}
