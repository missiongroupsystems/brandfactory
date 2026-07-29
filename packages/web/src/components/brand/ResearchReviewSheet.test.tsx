import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResearchReviewSheet } from './ResearchReviewSheet'
import type { ResearchDraft } from '@/demo/researchTypes'

const DRAFTS: ResearchDraft[] = [
  {
    label: 'Target audience',
    text: 'Households within a short walk.',
    html: '<p>Households within a short walk.</p>',
    sources: [{ title: 'Dining guide', url: 'https://example.com/guide' }],
  },
  {
    label: 'Voice & tone',
    text: 'Short, second person, slightly dry.',
    html: '<p>Short, second person, slightly dry.</p>',
    sources: [{ title: 'Own website', url: 'https://example.com/' }],
  },
]

function open(onAcceptSelected = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <ResearchReviewSheet
      open
      onOpenChange={onOpenChange}
      drafts={DRAFTS}
      onAcceptSelected={onAcceptSelected}
    />,
  )
  return { onAcceptSelected, onOpenChange }
}

describe('ResearchReviewSheet', () => {
  // The common case is "these look right, take them". Starting at zero would
  // make the ordinary path five clicks longer than the exceptional one.
  it('arrives with every draft selected', () => {
    open()
    expect(screen.getByRole('button', { name: 'Accept selected (2)' })).toBeTruthy()
    for (const box of screen.getAllByRole('checkbox')) {
      expect((box as HTMLInputElement).checked).toBe(true)
    }
  })

  // Research decision 4 exists because a cited, confident, entirely wrong brand
  // profile is this feature's failure mode — citations make a result *look*
  // more trustworthy, not less. So the sources sit where the decision is made.
  it('shows each draft’s sources next to the decision to accept it', () => {
    open()
    const link = screen.getByRole('link', { name: /Dining guide/ })
    expect(link.getAttribute('href')).toBe('https://example.com/guide')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('hands back only what is still ticked', async () => {
    const { onAcceptSelected } = open()

    await userEvent.click(screen.getByLabelText('Target audience'))
    expect(screen.getByRole('button', { name: 'Accept selected (1)' })).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Accept selected (1)' }))
    expect(onAcceptSelected).toHaveBeenCalledWith([DRAFTS[1]])
  })

  it('will not accept nothing', async () => {
    open()
    for (const box of screen.getAllByRole('checkbox')) await userEvent.click(box)
    expect(
      screen.getByRole('button', { name: 'Accept selected (0)' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  // Nothing here writes: the guidelines have exactly one writer, and acceptance
  // routes through the ordinary editor rather than a second save path.
  it('says plainly that nothing is saved yet', () => {
    open()
    expect(screen.getByText(/Nothing is saved until you accept/)).toBeTruthy()
  })

  it('dismisses without accepting', async () => {
    const { onAcceptSelected, onOpenChange } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onAcceptSelected).not.toHaveBeenCalled()
  })
})
