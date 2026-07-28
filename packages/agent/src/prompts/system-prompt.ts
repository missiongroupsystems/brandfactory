import type { BrandWithSections } from '@brandfactory/shared'
import { BRAND_CONTEXT_TEMPLATE_ID } from '../templates'
import { proseMirrorDocToPlainText } from './prose-mirror-to-text'

export interface SystemPromptOptions {
  /** The project's template id, when it is a standardized thread. */
  templateId?: string
}

// Composes the system prompt for the agent.
//
// Shape (intentionally fixed so Phase 6 route wiring doesn't shift):
//   1. Role preamble
//   2. Brand header (name, optional description)
//   3. Guideline sections, in ascending `priority` order, each rendered
//      as `## <label>\n<plain-text body>`
//   4. Canvas-awareness contract — OR, in a brand-context thread, the
//      interview contract in its place (Phase F). Only part 4 varies, and
//      only for that one template; a test pins the default byte-for-byte.
//
// The exact wording is tunable; callers should treat the output as opaque
// text, but the tests pin the structural invariants (brand name present,
// every section label appears, bodies are plain-text not raw JSON).
export function buildSystemPrompt(brand: BrandWithSections, opts?: SystemPromptOptions): string {
  const parts: string[] = []

  parts.push(
    `You are the creative partner for brand "${brand.name}". Every response must be consistent with the brand's guidelines below.`,
  )

  const header: string[] = [`# Brand: ${brand.name}`]
  if (brand.description) header.push(brand.description)
  parts.push(header.join('\n\n'))

  if (brand.sections.length > 0) {
    const sorted = [...brand.sections].sort((a, b) => a.priority - b.priority)
    const sectionsBlock = ['## Brand guidelines']
    for (const section of sorted) {
      const body = proseMirrorDocToPlainText(section.body)
      sectionsBlock.push(`### ${section.label}\n${body}`)
    }
    parts.push(sectionsBlock.join('\n\n'))
  }

  parts.push(
    opts?.templateId === BRAND_CONTEXT_TEMPLATE_ID
      ? [
          '## Brand context interview',
          'This conversation is for developing and articulating the brand itself, not for producing work from it. Interview the user.',
          'Ask one sharp question at a time and wait for the answer. Five questions at once gets one of them answered.',
          'Probe for specifics rather than accepting the first abstraction: who is this really for, what would you never say, what would a competitor claim that this brand would not.',
          'When an aspect settles, reflect it back as a single crisp articulation the user could keep verbatim — not a menu of five options to choose between.',
          'You have no canvas and no tools in this conversation, and you never write to the brand yourself. The user decides by hand what becomes part of it, so a sentence worth keeping is worth more than a paragraph of hedging.',
        ].join('\n\n')
      : [
          '## Canvas awareness',
          'A "CANVAS STATE" block will follow this prompt. It describes the user\'s current canvas: pinned blocks are the shortlist the user liked, unpinned blocks are ideas still in play, and any recent ops record the latest changes.',
          'Use the `add_canvas_block`, `pin_block`, and `unpin_block` tools to mutate the canvas. Do not paste the content of new blocks into your reply — call the tool and acknowledge briefly.',
        ].join('\n\n'),
  )

  return parts.join('\n\n')
}
