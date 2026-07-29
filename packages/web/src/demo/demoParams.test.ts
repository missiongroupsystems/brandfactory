import { describe, expect, it } from 'vitest'
import { demoHref, readDemoParams } from './demoParams'
import type { ScenarioId } from './fixtures'

const KNOWN: ScenarioId[] = ['bare', 'rich', 'palette-full']

describe('readDemoParams', () => {
  it('reads both knobs from the query string', () => {
    expect(readDemoParams('?scenario=rich&rail=A', KNOWN, 'bare')).toEqual({
      scenario: 'rich',
      rail: 'A',
    })
  })

  // C is the default because C *is* 1.7.0 — the only one of the three
  // arrangements that is also the shipped layout. B reflows the identity band,
  // so a deep link that forgot the knob must not move the mark.
  it('falls back to rail structure C', () => {
    expect(readDemoParams('?scenario=rich', KNOWN, 'bare').rail).toBe('C')
    expect(readDemoParams('?scenario=rich&rail=Z', KNOWN, 'bare').rail).toBe('C')
  })

  it('falls back to the given scenario when the name is unknown', () => {
    expect(readDemoParams('?scenario=nope', KNOWN, 'bare').scenario).toBe('bare')
    expect(readDemoParams('', KNOWN, 'rich').scenario).toBe('rich')
  })
})

describe('demoHref', () => {
  // The assets page has no rail, but carrying the choice across the hop is what
  // lets the back link return you to the arrangement you were reviewing.
  it('carries both knobs across a navigation', () => {
    expect(demoHref('/demo/brand/assets', { scenario: 'rich', rail: 'A' })).toBe(
      '/demo/brand/assets?scenario=rich&rail=A',
    )
  })
})
