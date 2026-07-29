import { describe, expect, it } from 'vitest'
import { readDemoParams } from './demoParams'
import type { ScenarioId } from './fixtures'

const KNOWN: ScenarioId[] = ['bare', 'rich', 'researching']

// One knob since 2C. `rail` picked between three palette arrangements that
// 1.8.0 built so that two could be deleted; the screenshots settled it, the
// deletion was the deliverable, and the knob went with them.

describe('readDemoParams', () => {
  it('reads the scenario from the query string', () => {
    expect(readDemoParams('?scenario=rich', KNOWN, 'bare')).toEqual({ scenario: 'rich' })
  })

  it('falls back to the given scenario when the name is unknown', () => {
    expect(readDemoParams('?scenario=nope', KNOWN, 'bare').scenario).toBe('bare')
    expect(readDemoParams('', KNOWN, 'rich').scenario).toBe('rich')
  })

  // A stale deep link from before 2C still resolves rather than 404-ing on its
  // own query string; the dropped knob is simply ignored.
  it('ignores a leftover rail knob', () => {
    expect(readDemoParams('?scenario=rich&rail=A', KNOWN, 'bare')).toEqual({ scenario: 'rich' })
  })
})
