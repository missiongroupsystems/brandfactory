import { describe, expect, it } from 'vitest'
import { KEY_DATE_APPEARANCE, KEY_DATE_SETS, type KeyDateSet } from './index'

describe('KEY_DATE_APPEARANCE', () => {
  it('covers exactly the declared sets', () => {
    // `Record<KeyDateSet, …>` makes a missing key a type error; this catches
    // the other half — a stale key left behind after a set is renamed.
    expect(Object.keys(KEY_DATE_APPEARANCE).sort()).toEqual([...KEY_DATE_SETS].sort())
  })

  it('gives every set a non-empty label and dot', () => {
    for (const set of KEY_DATE_SETS) {
      expect(KEY_DATE_APPEARANCE[set].label.trim(), set).not.toBe('')
      expect(KEY_DATE_APPEARANCE[set].dot.trim(), set).not.toBe('')
    }
  })

  it('names its own token in every class string', () => {
    // The cheap guard against a copy-paste that leaves two sets sharing a hue —
    // the failure that renders perfectly and simply lies about which set a date
    // belongs to.
    for (const set of KEY_DATE_SETS) {
      const { label, dot } = KEY_DATE_APPEARANCE[set]
      expect(label, set).toContain(`keydate-${set}`)
      expect(dot, set).toContain(`keydate-${set}`)
    }
  })

  it('gives each set a distinct pair of class strings', () => {
    const labels = KEY_DATE_SETS.map((s) => KEY_DATE_APPEARANCE[s].label)
    const dots = KEY_DATE_SETS.map((s) => KEY_DATE_APPEARANCE[s].dot)
    expect(new Set(labels).size).toBe(KEY_DATE_SETS.length)
    expect(new Set(dots).size).toBe(KEY_DATE_SETS.length)
  })

  it('writes whole class names rather than composing them', () => {
    // Tailwind scans source text: an interpolated class name produces no CSS
    // and fails silently as a colourless pill. Nothing here may contain a
    // template hole.
    for (const set of KEY_DATE_SETS) {
      const { label, dot } = KEY_DATE_APPEARANCE[set]
      expect(label + dot, set).not.toContain('${')
    }
  })

  it('pairs a tint background with its ink for the label, and a solid fill for the dot', () => {
    // The two are different shapes on purpose: a label is text on its own tint
    // and needs both halves, a dot is a filled swatch and needs neither text
    // colour nor a tint.
    for (const set of KEY_DATE_SETS) {
      const { label, dot } = KEY_DATE_APPEARANCE[set]
      expect(label, set).toContain(`bg-keydate-${set}-tint`)
      expect(label, set).toContain(`text-keydate-${set}`)
      expect(dot, set).toBe(`bg-keydate-${set}`)
    }
  })

  it('is indexable by a set read back from storage', () => {
    // The lookup Phase C's preference module feeds: a `KeyDateSet` that came
    // from a string, not a literal, must still hit.
    const fromStorage = 'sg-events' as KeyDateSet
    expect(KEY_DATE_APPEARANCE[fromStorage].dot).toBe('bg-keydate-sg-events')
  })
})
