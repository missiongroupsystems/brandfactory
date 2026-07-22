import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GUIDELINE_METER_TOTAL, GuidelineMeter } from './GuidelineMeter'

describe('GuidelineMeter', () => {
  it('renders total dots with an accessible label', () => {
    const { container } = render(<GuidelineMeter sectionCount={3} />)
    const meter = screen.getByRole('img', {
      name: `3 of ${GUIDELINE_METER_TOTAL} guideline sections`,
    })
    expect(meter).toBeTruthy()
    expect(container.querySelectorAll('[class*="rounded-full"]').length).toBe(GUIDELINE_METER_TOTAL)
  })

  it('zero state is all hollow with no error styling', () => {
    const { container } = render(<GuidelineMeter sectionCount={0} />)
    expect(
      screen.getByRole('img', { name: `0 of ${GUIDELINE_METER_TOTAL} guideline sections` }),
    ).toBeTruthy()
    const dots = container.querySelectorAll('span[class*="rounded-full"]')
    expect(dots.length).toBe(GUIDELINE_METER_TOTAL)
    for (const dot of dots) {
      const cls = dot.getAttribute('class') ?? ''
      expect(cls).toMatch(/border/)
      expect(cls).not.toMatch(/destructive|green|red|warning/)
    }
  })

  it('fills the first n dots', () => {
    const { container } = render(<GuidelineMeter sectionCount={2} />)
    const dots = [...container.querySelectorAll('span[class*="rounded-full"]')]
    const filled = dots.filter((d) =>
      (d.getAttribute('class') ?? '').includes('bg-muted-foreground'),
    )
    const hollow = dots.filter((d) => (d.getAttribute('class') ?? '').includes('border'))
    expect(filled.length).toBe(2)
    expect(hollow.length).toBe(GUIDELINE_METER_TOTAL - 2)
  })

  it('clamps filled dots when sectionCount exceeds the suggested total', () => {
    const { container } = render(<GuidelineMeter sectionCount={GUIDELINE_METER_TOTAL + 4} />)
    expect(
      screen.getByRole('img', {
        name: `${GUIDELINE_METER_TOTAL + 4} of ${GUIDELINE_METER_TOTAL} guideline sections`,
      }),
    ).toBeTruthy()
    const dots = [...container.querySelectorAll('span[class*="rounded-full"]')]
    expect(dots.length).toBe(GUIDELINE_METER_TOTAL)
    const filled = dots.filter((d) =>
      (d.getAttribute('class') ?? '').includes('bg-muted-foreground'),
    )
    expect(filled.length).toBe(GUIDELINE_METER_TOTAL)
  })
})
