import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { KeyDate, KeyDateSet } from '@/lib/key-dates'
import { KeyDateStrip } from './KeyDateStrip'

function season(id: string, start: string, end: string, set: KeyDateSet = 'sg-events'): KeyDate {
  return { id, set, name: id, start, end, source: 'test' }
}

describe('KeyDateStrip', () => {
  it('renders nothing at all for an empty month', () => {
    // `null`, not an empty container: a month with no seasons must be
    // pixel-identical to the grid before this feature existed.
    const { container } = render(<KeyDateStrip seasons={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one band per season, with its range', () => {
    render(
      <KeyDateStrip
        seasons={[
          season('i Light Singapore', '2026-06-05', '2026-06-28'),
          season('Sentosa GrillFest', '2026-07-23', '2026-08-16'),
        ]}
      />,
    )
    const bands = screen.getAllByRole('listitem')
    expect(bands).toHaveLength(2)
    expect(bands[0]!.textContent).toContain('i Light Singapore')
    expect(bands[0]!.textContent).toContain('5–28 Jun')
    // A range crossing a month boundary shows both months rather than a
    // clipped one — the band states the true span, not the visible slice.
    expect(bands[1]!.textContent).toContain('23 Jul – 16 Aug')
  })

  it('names the set for anyone who cannot use the colour', () => {
    // Phase B measured rose and teal at ΔE 8.4 under simulated protanopia, so
    // the hue cannot be the only carrier. It is visually hidden rather than
    // rendered because the band is already short and the colour is the fast
    // path for everyone else.
    render(<KeyDateStrip seasons={[season('Hungry Ghost', '2026-08-13', '2026-09-10')]} />)
    expect(screen.getByRole('listitem').textContent).toContain('Singapore events:')
  })

  it('colours each band from its own set', () => {
    render(
      <KeyDateStrip
        seasons={[
          season('Ramadan', '2026-02-19', '2026-03-20', 'global'),
          season('Hungry Ghost', '2026-08-13', '2026-09-10', 'sg-holidays'),
          season('i Light', '2026-06-05', '2026-06-28', 'sg-events'),
        ]}
      />,
    )
    const bands = screen.getAllByRole('listitem')
    expect(bands[0]!.className).toContain('keydate-global')
    expect(bands[1]!.className).toContain('keydate-sg-holidays')
    expect(bands[2]!.className).toContain('keydate-sg-events')
  })
})
