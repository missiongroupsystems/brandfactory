import { generateObject, jsonSchema } from 'ai'
import { z } from 'zod'
import type { LLMProvider, LLMProviderSettings } from '@brandfactory/adapter-llm'
import {
  GUIDELINE_LABEL_MAX_CHARS,
  SUGGESTED_SECTIONS,
  type ResearchDraft,
  type ResearchSource,
} from '@brandfactory/shared'
import { markdownToDraftBody } from './markdown'

// ---------------------------------------------------------------------------
// Stage 2 of the research run: shaping a report into draft sections
// ---------------------------------------------------------------------------
//
// **On the workspace's own configured model, not on the search vendor**
// (decision 5). Perplexity is the *finder*; the writing model is the one the
// user chose. Asking the finder for our JSON directly was considered and
// rejected: it couples our guideline schema to a vendor surface already flagged
// as churning, it throws the report away, and it puts schema work on the model
// picked for search.
//
// **The requirement 3A produced, and the one that shapes this whole file:**
// the live report came back at **67,780 characters** across five `##` sections,
// the smallest of which was 7,972. One `##` per draft — the obvious reading of
// "convert the report into sections" — puts a **16,000-character Voice & tone**
// into a rail row built for a paragraph. So this is a *compression* pass, and
// the prompt and the schema both say so.

/**
 * What the model is allowed to return. Deliberately narrow.
 *
 * **`label` carries no maximum, and that is the deliberate part.** This schema
 * validates one *batch*: `safeParse` is all-or-nothing, so a bound here turns a
 * single over-long label into zero drafts for the entire run. The real bound is
 * `GUIDELINE_LABEL_MAX_CHARS`, applied by clamping below — where it costs the
 * one label its tail instead of costing the batch everything.
 */
const ShapedSectionSchema = z.object({
  label: z.string().min(1),
  /** Short markdown: paragraphs and bullets. See `markdownToDraftBody`. */
  markdown: z.string().min(1),
  /** URLs the section rests on. Resolved against the report's own citations. */
  sourceUrls: z.array(z.string()).default([]),
})

const ShapedSectionsSchema = z.object({
  sections: z.array(ShapedSectionSchema),
})

/**
 * The ceiling the prompt asks for and the reason it exists.
 *
 * Not enforced by truncation — a sentence cut in half is worse than a long one
 * — but stated to the model and measured in the tests, because "keep it short"
 * without a number is how a 16,000-character section happens.
 */
export const DRAFT_TARGET_MAX_CHARS = 1200

export interface ShapeResearchInput {
  brandName: string
  /** Stage 1's markdown report, verbatim. */
  report: string
  /** The report's citations. **The only URLs a draft may cite.** */
  citations: ResearchSource[]
  llmProvider: LLMProvider
  llmSettings: LLMProviderSettings
  signal?: AbortSignal
}

/**
 * Why a shaping pass produced what it produced.
 *
 * **This exists because "zero drafts" used to be unspeakable.** The pass had
 * four ways to return an empty list and one way to throw, and only the throw
 * reached a log — so a $0.40 run that finished with no drafts left an operator
 * with a completed job, an empty review sheet and nothing to read. That is not
 * hypothetical: the first watched production run (1.13.1) landed exactly there,
 * and the cause is still unknown *because the code could not say*.
 *
 * The three failures are genuinely different events and want different
 * responses, which is the whole reason they are named apart:
 *
 * - `invalid-shape` — the model did not answer in the schema at all. A
 *   configuration fact about the writing model (structured-output support on
 *   the configured provider), not a fact about the brand, and the only one that
 *   is nobody's fault but ours.
 * - `no-sections` — the model answered correctly with an empty list. Rule 1 of
 *   the prompt is *omit rather than invent*, so this is the pass doing as it was
 *   told over a report that had nothing solid in it.
 * - `sections-dropped` — sections came back and this file rejected every one of
 *   them (empty body, whitespace-only label). A bug or a prompt drift here, and
 *   invisible before now because the drop is deliberately silent per section.
 */
export type ShapeOutcome = 'ok' | 'invalid-shape' | 'no-sections' | 'sections-dropped'

export interface ShapeResearchResult {
  drafts: ResearchDraft[]
  outcome: ShapeOutcome
  /** Report characters handed to the model — 3A measured a real one at 67,780. */
  reportChars: number
  /** Sections the model returned, **before** this file's own filtering. */
  sectionsReturned: number
}

export function buildShapePrompt(input: {
  brandName: string
  citations: ResearchSource[]
}): string {
  const labels = SUGGESTED_SECTIONS.map((s) => `- ${s.label}: ${s.description}`).join('\n')
  const sources = input.citations.map((c) => `- ${c.url} — ${c.title}`).join('\n')

  return `You are turning a long research report about the brand "${input.brandName}" into short, usable brand guideline sections.

Use these section labels where the report supports them, and prefer them over inventing your own:

${labels}

Rules, in order of importance:

1. **Omit a section rather than invent one.** If the report has nothing solid for a label, leave it out. A missing section is honest; a padded one is a lie the user has to find.
2. **Compress.** The report is long and repetitive by design; a section is 3–6 sentences, under ${DRAFT_TARGET_MAX_CHARS} characters. You are writing the version someone reads in a sidebar, not a summary of everything the report says.
3. **Quote the brand's own words** where the report gives them. Their phrasing is the asset; yours is a paraphrase of it.
4. **Cite only from this list.** Every URL you attach must appear here verbatim; anything else is dropped.
5. **No colour values.** Never write hex codes or RGB values into any section — this product stores colours as structured data with their own editor, and prose that restates them puts one fact in two places. Describe the thinking and the references instead.
6. Write plain markdown: paragraphs, and bullet lists where a list is genuinely the shape. No headings, no tables, no images.
7. **Labels are short** — a few words, at most ${GUIDELINE_LABEL_MAX_CHARS} characters. A label names a section; it does not summarise it.

Sources available for citation:

${sources || '- (none)'}`
}

/**
 * Report → drafts. Returns an empty list rather than throwing on an empty
 * result, and the caller treats that as "nothing shaped", never as "nothing
 * found" — but it now returns **why** alongside, because an empty list with no
 * explanation is what made the first production run undiagnosable. See
 * `ShapeOutcome`.
 *
 * **Two rules are enforced here rather than trusted to the prompt**, because a
 * prompt is a request and this file is the boundary:
 *
 * - **Sources are resolved against the report's citations**, by URL. A model
 *   that invents a plausible URL — the failure mode the whole citation design
 *   exists to catch — gets it dropped, and a section with no surviving citation
 *   still lands, because the citations are provenance for a human reviewer
 *   rather than a gate on the text.
 * - **A section with an empty body is dropped.** A label with nothing under it
 *   is a row in the review sheet that wastes the reviewer's only decision.
 * - **A label is clamped to `GUIDELINE_LABEL_MAX_CHARS`**, not rejected for
 *   exceeding it. The drafts' only destination is a guideline section, the wire
 *   into it takes the brand's *complete* list, and so a label this boundary lets
 *   through over-long does not fail itself — it fails every draft beside it.
 */
export async function shapeResearchIntoSections(
  input: ShapeResearchInput,
): Promise<ShapeResearchResult> {
  const reportChars = input.report.length
  const byUrl = new Map(input.citations.map((c) => [c.url, c]))

  // **JSON Schema rather than the zod object, and the result parsed here.**
  // The installed `ai` 4.0.20 types (and its internal converter) expect a zod
  // *3* schema; this repo is on zod 4.3.6, whose internals differ. Handing the
  // SDK `z.toJSONSchema(...)` sidesteps the mismatch entirely, and parsing the
  // result with the zod schema afterwards means the model's output is validated
  // by us rather than trusted because it came back.
  const { object } = await generateObject({
    model: input.llmProvider.getModel(input.llmSettings),
    schema: jsonSchema<z.infer<typeof ShapedSectionsSchema>>(
      z.toJSONSchema(ShapedSectionsSchema) as Record<string, unknown>,
    ),
    system: buildShapePrompt(input),
    prompt: input.report,
    abortSignal: input.signal,
  })

  const parsed = ShapedSectionsSchema.safeParse(object)
  // A model that returns something else entirely is a failed shaping pass, not
  // a failed research run: the caller keeps the report and lands zero drafts.
  //
  // **The most likely branch on a provider that ignores `response_format`**, and
  // therefore the one that most needed a name. It is reported, not thrown, for
  // the same reason as ever — the report is already paid for — and the caller
  // logs it at `error` because unlike the two below it is our configuration
  // rather than the brand's website.
  if (!parsed.success) {
    return { drafts: [], outcome: 'invalid-shape', reportChars, sectionsReturned: 0 }
  }

  const drafts: ResearchDraft[] = []
  for (const section of parsed.data.sections) {
    const { html, text } = markdownToDraftBody(section.markdown)
    if (!text.trim()) continue
    const sources = section.sourceUrls
      .map((url) => byUrl.get(url))
      .filter((s): s is ResearchSource => !!s)
    // Clamped, never rejected — see the note above. `trim` first so the cap is
    // spent on characters rather than on the model's trailing whitespace.
    const label = section.label.trim().slice(0, GUIDELINE_LABEL_MAX_CHARS)
    // A label that was *only* whitespace has nothing to name the section with,
    // and the wire's `min(1)` would refuse the batch for it.
    if (!label) continue
    drafts.push({ label, html, text, sources })
  }

  const sectionsReturned = parsed.data.sections.length
  return {
    drafts,
    // `sections-dropped` is the one this file is answerable for: the model
    // produced sections and every one of them was rejected above. Telling it
    // apart from an honest empty answer is the difference between a bug here and
    // a report with nothing in it.
    outcome: drafts.length > 0 ? 'ok' : sectionsReturned === 0 ? 'no-sections' : 'sections-dropped',
    reportChars,
    sectionsReturned,
  }
}
