import { describe, expect, it } from 'vitest'
import type {
  BrandGuidelineSection,
  BrandId,
  BrandWithSections,
  SectionId,
  WorkspaceId,
} from '@brandfactory/shared'
import { buildSystemPrompt } from './system-prompt'

const ts = '2026-04-19T00:00:00.000Z'

const pmParagraph = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

function makeSection(
  overrides: Partial<BrandGuidelineSection> & Pick<BrandGuidelineSection, 'label' | 'priority'>,
): BrandGuidelineSection {
  return {
    id: `sec_${overrides.label}` as SectionId,
    brandId: 'b1' as BrandId,
    label: overrides.label,
    body: overrides.body ?? pmParagraph(`${overrides.label} body`),
    priority: overrides.priority,
    createdBy: 'user',
    createdAt: ts,
    updatedAt: ts,
  }
}

function makeBrand(sections: BrandGuidelineSection[]): BrandWithSections {
  return {
    id: 'b1' as BrandId,
    workspaceId: 'w1' as WorkspaceId,
    name: 'Northstar Coffee',
    description: 'Specialty roaster with a minimalist aesthetic.',
    websiteUrl: null,
    createdAt: ts,
    updatedAt: ts,
    sections,
  }
}

describe('buildSystemPrompt', () => {
  it('includes brand name, description, section labels in priority order, and plain-text bodies', () => {
    const sections = [
      makeSection({ label: 'Voice', priority: 20, body: pmParagraph('Warm and direct.') }),
      makeSection({
        label: 'Audience',
        priority: 10,
        body: pmParagraph('Urban millennials.'),
      }),
    ]
    const prompt = buildSystemPrompt(makeBrand(sections))

    expect(prompt).toContain('Northstar Coffee')
    expect(prompt).toContain('Specialty roaster with a minimalist aesthetic.')
    expect(prompt).toContain('Audience')
    expect(prompt).toContain('Urban millennials.')
    expect(prompt).toContain('Voice')
    expect(prompt).toContain('Warm and direct.')
    expect(prompt).not.toContain('"type":"paragraph"')

    const audienceIdx = prompt.indexOf('Audience')
    const voiceIdx = prompt.indexOf('Voice\n')
    expect(audienceIdx).toBeGreaterThan(-1)
    expect(voiceIdx).toBeGreaterThan(audienceIdx)
  })

  // Phase F pins the default output byte-for-byte, so giving the brand-context
  // thread its own persona cannot quietly reword the prompt every other thread
  // gets. Recorded from the pre-Phase-F build, before `opts` existed.
  it('is byte-identical with no options, an empty options object, or another template', () => {
    const brand = makeBrand([])

    expect(buildSystemPrompt(brand)).toMatchInlineSnapshot(`
      "You are the creative partner for brand "Northstar Coffee". Every response must be consistent with the brand's guidelines below.

      # Brand: Northstar Coffee

      Specialty roaster with a minimalist aesthetic.

      ## Canvas awareness

      A "CANVAS STATE" block will follow this prompt. It describes the user's current canvas: pinned blocks are the shortlist the user liked, unpinned blocks are ideas still in play, and any recent ops record the latest changes.

      Use the \`add_canvas_block\`, \`pin_block\`, and \`unpin_block\` tools to mutate the canvas. Do not paste the content of new blocks into your reply — call the tool and acknowledge briefly."
    `)
    expect(buildSystemPrompt(brand, {})).toBe(buildSystemPrompt(brand))
    expect(buildSystemPrompt(brand, { templateId: 'copywriting' })).toBe(buildSystemPrompt(brand))
  })

  it('still renders the canvas-awareness contract when the brand has zero sections', () => {
    const brand = makeBrand([])
    const prompt = buildSystemPrompt(brand)
    expect(prompt).toContain('Northstar Coffee')
    expect(prompt).toContain('CANVAS STATE')
    expect(prompt).not.toContain('## Brand guidelines')
  })

  // The header applies the same precedence every surface does. A brand holding
  // both fields must not hand the model two competing answers to *what is this
  // brand* — least of all when the losing one is invisible on every screen and
  // the user therefore cannot see, or fix, the disagreement.
  describe('the description defers to the TL;DR', () => {
    const tldr = (body?: ReturnType<typeof pmParagraph>) =>
      makeSection({ label: 'TL;DR', priority: 0, body })

    it('drops the typed description when the brand has written a TL;DR', () => {
      const prompt = buildSystemPrompt(makeBrand([tldr(pmParagraph('A specialty roaster.'))]))

      expect(prompt).not.toContain('Specialty roaster with a minimalist aesthetic.')
      // Dropped from the header, not from the prompt: part 3 still carries it.
      expect(prompt).toContain('### TL;DR\nA specialty roaster.')
    })

    it('does not repeat the TL;DR in the header', () => {
      const prompt = buildSystemPrompt(makeBrand([tldr(pmParagraph('A specialty roaster.'))]))
      expect(prompt.split('A specialty roaster.')).toHaveLength(2)
    })

    it('keeps the description when the brand has no TL;DR', () => {
      const prompt = buildSystemPrompt(makeBrand([makeSection({ label: 'Voice', priority: 10 })]))
      expect(prompt).toContain('Specialty roaster with a minimalist aesthetic.')
    })

    // The rail's suggestion chip creates the labelled row before anyone types
    // into it. The prompt must agree with the header about that brand.
    it('keeps the description when the TL;DR row exists but is empty', () => {
      const prompt = buildSystemPrompt(makeBrand([tldr({ type: 'doc', content: [] })]))
      expect(prompt).toContain('Specialty roaster with a minimalist aesthetic.')
    })

    it('finds the TL;DR however its label was punctuated', () => {
      const section = makeSection({
        label: 'tldr',
        priority: 0,
        body: pmParagraph('A specialty roaster.'),
      })
      expect(buildSystemPrompt(makeBrand([section]))).not.toContain(
        'Specialty roaster with a minimalist aesthetic.',
      )
    })
  })

  // Phase F2. The canvas block is *replaced*, not supplemented: a thread with no
  // canvas must not be told how to use one.
  it('swaps the canvas contract for the interview contract in a brand-context thread', () => {
    const sections = [makeSection({ label: 'Voice', priority: 10 })]
    const prompt = buildSystemPrompt(makeBrand(sections), { templateId: 'brand-context' })

    expect(prompt).toContain('## Brand context interview')
    expect(prompt).not.toContain('## Canvas awareness')
    expect(prompt).not.toContain('CANVAS STATE')
    expect(prompt).not.toContain('add_canvas_block')
    // The brand itself is still the context — only the closing contract differs.
    expect(prompt).toContain('Northstar Coffee')
    expect(prompt).toContain('Voice')
    // The honest half of F3: a persona is not a capability. It says so.
    expect(prompt).toContain('never write to the brand yourself')
  })
})
