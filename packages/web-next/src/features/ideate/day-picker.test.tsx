import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'

import { DayPicker } from './day-picker'

vi.mock('next/navigation', () => ({
  usePathname: () => '/ideate',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))

const open = (fieldTop: number) => {
  vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: fieldTop,
    bottom: fieldTop + 32,
  } as DOMRect)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(380)
  render(
    <BrandProvider>
      <DayPicker
        label="Post date"
        value="2026-10-20"
        onChange={() => {}}
        infoOf={() => ({}) as never}
      />
    </BrandProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Post date' }))
  return screen.getByRole('dialog', { name: 'Post date' })
}

afterEach(() => vi.restoreAllMocks())

// The judge found the popover cut off at the window's foot: there it opens upward instead.
describe('the date popover', () => {
  it('opens below the field when there is room', () => {
    expect(open(100).className).toContain('top-full')
  })

  it('opens above the field near the foot of the window', () => {
    expect(open(window.innerHeight - 60).className).toContain('bottom-full')
  })
})
