import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettled } from './shell'

let reduce = false
beforeEach(() => {
  vi.useFakeTimers()
  window.matchMedia = ((query: string) =>
    ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
})
afterEach(() => {
  vi.useRealTimers()
  reduce = false
})

describe('useSettled', () => {
  it('shows the old value for a beat, then the new one, so a moved day is seen to move', () => {
    const { result } = renderHook(() => useSettled('Mon 20 Oct', 'Sat 24 Oct'))
    expect(result.current).toEqual({ value: 'Mon 20 Oct', moved: false })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toEqual({ value: 'Sat 24 Oct', moved: true })
  })

  it('shows the new value at once with nothing to move from, or nothing changed', () => {
    expect(renderHook(() => useSettled(undefined, 'Sat 24 Oct')).result.current).toEqual({
      value: 'Sat 24 Oct',
      moved: false,
    })
    expect(renderHook(() => useSettled('Sat 24 Oct', 'Sat 24 Oct')).result.current).toEqual({
      value: 'Sat 24 Oct',
      moved: false,
    })
  })

  it('skips the beat when the system asks for less motion', () => {
    reduce = true
    const { result } = renderHook(() => useSettled('Mon 20 Oct', 'Sat 24 Oct'))
    expect(result.current).toEqual({ value: 'Sat 24 Oct', moved: false })
  })
})
