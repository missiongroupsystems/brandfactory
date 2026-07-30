import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNow } from '@/lib/use-now'

const T0 = Date.parse('2026-07-30T09:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useNow', () => {
  // The regression this hook exists for. A poll is not a clock: React Query
  // hands back the same `data` reference for a deep-equal payload, so nothing
  // re-rendered the in-flight row for the length of a run and elapsed time was
  // frozen at whatever the first frame said.
  it('advances on its own with no other state changing', () => {
    const { result } = renderHook(() => useNow(true))
    expect(result.current).toBe(T0)

    act(() => void vi.advanceTimersByTime(1_000))
    expect(result.current).toBe(T0 + 1_000)

    act(() => void vi.advanceTimersByTime(4_000))
    expect(result.current).toBe(T0 + 5_000)
  })

  it('holds still while inactive', () => {
    const { result } = renderHook(() => useNow(false))
    act(() => void vi.advanceTimersByTime(60_000))
    expect(result.current).toBe(T0)
  })

  // A hub mounted and idle for an hour must not start its first tick an hour
  // behind — the value is re-read when the interval is armed, not only created.
  it('resyncs when it becomes active', () => {
    const { result, rerender } = renderHook(({ on }) => useNow(on), {
      initialProps: { on: false },
    })

    act(() => void vi.advanceTimersByTime(3_600_000))
    expect(result.current).toBe(T0)

    rerender({ on: true })
    expect(result.current).toBe(T0 + 3_600_000)
  })

  it('takes the interval it is given', () => {
    const { result } = renderHook(() => useNow(true, 5_000))
    act(() => void vi.advanceTimersByTime(4_999))
    expect(result.current).toBe(T0)
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toBe(T0 + 5_000)
  })

  // A rail unmounts on every navigation away from the hub. A leaked interval
  // per visit would tick against a dead component for the life of the tab.
  it('stops on unmount', () => {
    const clear = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useNow(true))
    unmount()
    expect(clear).toHaveBeenCalled()
  })
})
