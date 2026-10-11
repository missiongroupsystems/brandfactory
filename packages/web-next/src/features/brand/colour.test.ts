import { describe, expect, it } from 'vitest'

import { hexOfHsv, hsvOf, mix, ramp } from './colour'

describe('the colour picker maths', () => {
  it('gives back the hex it was handed, so opening the picker never shifts a brand colour', () => {
    for (const hex of ['#D9572B', '#F7F1E8', '#3E6B48', '#1E1A17', '#000000', '#FFFFFF']) {
      expect(hexOfHsv(hsvOf(hex))).toBe(hex)
    }
  })

  it('reads hue, saturation and brightness as the square and slider draw them', () => {
    expect(hsvOf('#FF0000')).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexOfHsv({ h: 120, s: 1, v: 1 })).toBe('#00FF00')
    expect(hexOfHsv({ h: 240, s: 0, v: 0.5 })).toBe('#808080')
  })

  it('suggests tints and shades around the colour, with the colour itself in the middle', () => {
    const steps = ramp('#D9572B')
    expect(steps).toHaveLength(5)
    expect(steps[2]).toBe('#D9572B')
    expect(steps[0]).toBe(mix('#D9572B', '#FFFFFF', 0.6))
    expect(steps[4]).toBe(mix('#D9572B', '#000000', 0.5))
  })
})
