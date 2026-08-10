import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PostIdea } from '@brandfactory/shared'
import { PostBrainstormPanel } from './PostBrainstormPanel'

// The panel renders from props alone — no QueryClient, no router, no clock of
// its own. `now` is a fixture throughout, so *Today* is a fact about the
// fixture rather than about the day the suite runs.

const NOW = new Date(2026, 7, 10, 9, 0)

function idea(title: string, overrides: Partial<PostIdea> = {}): PostIdea {
  return {
    title,
    angle: `What ${title} actually shows`,
    pillar: null,
    date: '2026-08-10',
    platforms: ['instagram'],
    keyDateName: null,
    reason: `Why ${title} suits this brand`,
    ...overrides,
  }
}

const IDEAS = [idea('The pass at service'), idea('Regulars'), idea('Sunday roast')]

function setup(props: Partial<React.ComponentProps<typeof PostBrainstormPanel>> = {}) {
  const onRun = vi.fn()
  const onUse = vi.fn()
  render(
    <PostBrainstormPanel
      dayKey="2026-08-10"
      platform="instagram"
      now={NOW}
      ideas={null}
      onRun={onRun}
      onUse={onUse}
      {...props}
    />,
  )
  return { onRun, onUse }
}

describe('PostBrainstormPanel — before a run', () => {
  it('states the day and the platform the angles will be for', () => {
    setup()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Instagram')).toBeTruthy()
  })

  it('refuses to run without a platform, and says why', () => {
    setup({ platform: null })
    expect(screen.getByRole('button', { name: /Three angles/ })).toHaveProperty('disabled', true)
    // Not a disabled button with no explanation: the fix is one field away.
    expect(screen.getByText(/Choose a platform first/)).toBeTruthy()
  })

  it('runs when the button is pressed', async () => {
    const user = userEvent.setup()
    const { onRun } = setup()
    await user.click(screen.getByRole('button', { name: /Three angles/ }))
    expect(onRun).toHaveBeenCalledTimes(1)
  })

  it('shows no cards and no outcome line', () => {
    setup()
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.queryByText(/Nothing came back/)).toBeNull()
  })
})

describe('PostBrainstormPanel — the angles', () => {
  it('renders every angle with its reason', () => {
    setup({ ideas: IDEAS })
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Why Regulars suits this brand')).toBeTruthy()
  })

  it('names the key date an angle hangs off', () => {
    setup({ ideas: [idea('National Day', { keyDateName: 'National Day' })] })
    // Twice: once as the card's title, once as the chip.
    expect(screen.getAllByText('National Day')).toHaveLength(2)
  })

  it('reports which angle was picked', async () => {
    const user = userEvent.setup()
    const { onUse } = setup({ ideas: IDEAS })
    await user.click(screen.getByRole('button', { name: 'Use Regulars' }))
    expect(onUse).toHaveBeenCalledWith(1)
  })

  it('offers a second run that says it is a second run', () => {
    // *More*, not *again*: a retry label would read as free, and this call
    // costs what the first one cost.
    setup({ ideas: IDEAS })
    expect(screen.getByRole('button', { name: /Three more angles/ })).toBeTruthy()
  })

  it('marks the angle whose copy is in the field, and offers to rewrite it', () => {
    setup({ ideas: IDEAS, usedIndex: 0 })
    expect(screen.getByRole('button', { name: 'Use The pass at service' }).textContent).toContain(
      'Rewrite this',
    )
    expect(screen.getByRole('button', { name: 'Use Regulars' }).textContent).toContain('Use this')
  })

  it('locks every other card while one caption is being written', () => {
    setup({ ideas: IDEAS, writingIndex: 1 })
    expect(screen.getByRole('button', { name: 'Use Regulars' }).textContent).toContain('Writing…')
    expect(screen.getByRole('button', { name: 'Use Sunday roast' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(screen.getByRole('button', { name: /Three more angles/ })).toHaveProperty(
      'disabled',
      true,
    )
  })
})

describe('PostBrainstormPanel — the honest non-answers', () => {
  it('says so when the model had nothing for this day', () => {
    setup({ ideas: [], outcome: 'no-ideas' })
    expect(screen.getByText(/Nothing came back for this day/)).toBeTruthy()
  })

  it('names the model, not the brand, when the shape was wrong', () => {
    setup({ ideas: null, outcome: 'invalid-shape' })
    expect(screen.getByText(/did not answer in the expected shape/)).toBeTruthy()
  })

  it('says nothing at all on a good run', () => {
    setup({ ideas: IDEAS, outcome: 'ok' })
    expect(screen.queryByText(/Nothing came back/)).toBeNull()
    expect(screen.queryByText(/expected shape/)).toBeNull()
  })
})

describe('PostBrainstormPanel — the undo', () => {
  it('is absent when nothing was replaced', () => {
    setup({ ideas: IDEAS, usedIndex: 0 })
    expect(screen.queryByRole('button', { name: /Put my copy back/ })).toBeNull()
  })

  it('puts back what an angle overwrote', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    setup({ ideas: IDEAS, usedIndex: 0, onUndo })
    await user.click(screen.getByRole('button', { name: /Put my copy back/ }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })
})
