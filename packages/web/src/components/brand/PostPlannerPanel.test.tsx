import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { BrandWithSections, PostIdea } from '@brandfactory/shared'
import { PostPlannerPanel, type PostPlannerPanelProps } from './PostPlannerPanel'
import { initialSelections, type PlannerWindow } from '@/lib/social-plan'

// The same `Link` stub every test of a component holding one uses: this panel
// renders from props alone — no router, and **no `QueryClient`** — which is the
// seam `AssetLibraryView` established and the reason the whole planning surface
// can be tested without standing up a query layer.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode; to: string }) => (
    <a {...props}>{children}</a>
  ),
}))

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

const BRAND = {
  id: 'b-1',
  workspaceId: 'w-1',
  name: 'Casa Vostra',
  description: null,
  websiteUrl: null,
  linkedToPassport: false,
  ...STAMPS,
  sections: [],
} as unknown as BrandWithSections

const WINDOW: PlannerWindow = { start: '2026-08-01', end: '2026-08-31', weeks: 31 / 7 }

/** August 2026, so `formatDayHeading` never reads "Today" in an assertion. */
const NOW = new Date(2026, 7, 1, 9, 0, 0)

function idea(over: Partial<PostIdea> = {}): PostIdea {
  return {
    title: 'The pass at service',
    angle: 'Hands in frame, no faces.',
    pillar: 'Behind the pass',
    date: '2026-08-11',
    platforms: ['instagram'],
    keyDateName: null,
    reason: 'It is what regulars ask about.',
    ...over,
  }
}

function renderPanel(over: Partial<PostPlannerPanelProps> = {}) {
  const ideas = over.ideas === undefined ? null : over.ideas
  const props: PostPlannerPanelProps = {
    brand: BRAND,
    now: NOW,
    onClose: vi.fn(),
    window: WINDOW,
    windowChoice: 'month',
    onWindowChoiceChange: vi.fn(),
    keyDates: [],
    planned: 4,
    platforms: ['instagram'],
    onPlatformsChange: vi.fn(),
    cadence: 3,
    cadenceSource: 'history',
    onCadenceChange: vi.fn(),
    batch: { slots: 14, count: 18 },
    ideas,
    pillars: [{ name: 'Behind the pass', proposed: false }],
    selections: ideas ? initialSelections(ideas) : [],
    onToggleIdea: vi.fn(),
    onRemovePlatform: vi.fn(),
    onRun: vi.fn(),
    onReset: vi.fn(),
    onCommit: vi.fn(),
    ...over,
  }
  return { props, ...render(<PostPlannerPanel {...props} />) }
}

describe('PostPlannerPanel — the brief', () => {
  it('states the brand, the window and what is already in it', () => {
    renderPanel()
    expect(screen.getByText('Casa Vostra')).toBeTruthy()
    // Phase A's line, unchanged: this brand has no written sections.
    expect(screen.getByText('No brand context yet')).toBeTruthy()
    expect(screen.getByText(/2026-08-01 to 2026-08-31 · 4 posts already planned/)).toBeTruthy()
  })

  it('shows the cadence with its source, and the batch it derives', () => {
    renderPanel()
    expect(screen.getByText(/From your last 4 weeks · 18 ideas for 14 slots/)).toBeTruthy()
  })

  it('says so when the cadence is a suggestion rather than a measurement', () => {
    renderPanel({ cadenceSource: 'suggested', batch: { slots: 13, count: 18 } })
    expect(screen.getByText(/Suggested — no history yet/)).toBeTruthy()
  })

  it('reports an edited cadence rather than deciding anything itself', () => {
    const { props } = renderPanel()
    fireEvent.change(screen.getByLabelText('Posts per week'), { target: { value: '5' } })
    expect(props.onCadenceChange).toHaveBeenCalledWith(5)
  })

  it('clamps a cadence outside the schema’s bounds', () => {
    const { props } = renderPanel()
    fireEvent.change(screen.getByLabelText('Posts per week'), { target: { value: '99' } })
    expect(props.onCadenceChange).toHaveBeenCalledWith(21)
  })

  it('names the batch on the button', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Plan 18 ideas' })).toBeTruthy()
  })

  it('will not run with no platform chosen', () => {
    renderPanel({ platforms: [] })
    const button = screen.getByRole('button', { name: 'Plan 18 ideas' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('carries the honest non-answers in words', () => {
    renderPanel({ outcome: 'no-ideas' })
    expect(screen.getByText(/No ideas came back for this window/)).toBeTruthy()
  })

  it('says nothing extra after a run that worked', () => {
    renderPanel({ outcome: 'ok' })
    expect(screen.queryByText(/No ideas came back/)).toBeNull()
    expect(screen.queryByText(/did not answer in the expected shape/)).toBeNull()
  })
})

describe('PostPlannerPanel — the ideas', () => {
  it('counts the rows it would write, not the cards', () => {
    renderPanel({ ideas: [idea({ platforms: ['instagram', 'linkedin'] }), idea()] })
    // Two chips on one card and one on the other is three rows (Q8).
    expect(screen.getByRole('button', { name: 'Create 3 posts' })).toBeTruthy()
  })

  it('drops a rejected card out of the count', () => {
    const ideas = [idea({ platforms: ['instagram', 'linkedin'] }), idea()]
    renderPanel({
      ideas,
      selections: [
        { rejected: true, platforms: ['instagram', 'linkedin'] },
        { rejected: false, platforms: ['instagram'] },
      ],
    })
    expect(screen.getByRole('button', { name: 'Create 1 post' })).toBeTruthy()
  })

  it('drops a removed chip out of the count', () => {
    const ideas = [idea({ platforms: ['instagram', 'linkedin'] })]
    renderPanel({ ideas, selections: [{ rejected: false, platforms: ['instagram'] }] })
    expect(screen.getByRole('button', { name: 'Create 1 post' })).toBeTruthy()
  })

  it('has nothing to create when every card is rejected', () => {
    renderPanel({ ideas: [idea()], selections: [{ rejected: true, platforms: ['instagram'] }] })
    const button = screen.getByRole('button', { name: 'Create 0 posts' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('reports a rejection and a removed chip rather than deciding either', () => {
    const { props } = renderPanel({ ideas: [idea({ platforms: ['instagram', 'linkedin'] })] })
    fireEvent.click(screen.getByRole('button', { name: /^Reject/ }))
    expect(props.onToggleIdea).toHaveBeenCalledWith(0)

    fireEvent.click(screen.getByRole('button', { name: /Remove LinkedIn/ }))
    expect(props.onRemovePlatform).toHaveBeenCalledWith(0, 'linkedin')
  })

  it('says a dateless card is bound for the tray', () => {
    renderPanel({ ideas: [idea({ date: null })] })
    expect(screen.getByText('Unscheduled')).toBeTruthy()
  })

  it('groups under the pillars and marks the key-date cards', () => {
    renderPanel({
      ideas: [idea({ keyDateName: 'National Day', date: '2026-08-09' })],
      pillars: [{ name: 'Behind the pass', proposed: false }],
    })
    expect(screen.getByText('Behind the pass')).toBeTruthy()
    expect(screen.getByText('National Day')).toBeTruthy()
  })

  it('offers to save pillars only when the run proposed them', () => {
    const onSavePillars = vi.fn()
    renderPanel({
      ideas: [idea()],
      pillars: [{ name: 'Behind the pass', proposed: false }],
      onSavePillars,
    })
    expect(screen.queryByRole('button', { name: /Save these pillars/ })).toBeNull()

    renderPanel({
      ideas: [idea()],
      pillars: [{ name: 'Behind the pass', proposed: true }],
      onSavePillars,
    })
    fireEvent.click(screen.getByRole('button', { name: /Save these pillars/ }))
    expect(onSavePillars).toHaveBeenCalled()
  })

  it('reports how far a commit has got', () => {
    renderPanel({ ideas: [idea()], writing: true, progress: { done: 2, total: 5 } })
    expect(screen.getByRole('status').textContent).toContain('Written 2 of 5')
  })
})
