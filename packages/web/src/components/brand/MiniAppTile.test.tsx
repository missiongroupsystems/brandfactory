import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { miniAppById, type MiniApp } from './miniApps'
import { MiniAppTile } from './MiniAppTile'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)}
      {...props}
    >
      {children}
    </a>
  ),
}))

function app(id: string): MiniApp {
  const found = miniAppById(id)
  if (!found) throw new Error(`no mini-app ${id}`)
  return found
}

/**
 * The disabled example, and now a **synthetic** one.
 *
 * It was `visual` until 2E turned that tile on, then `social` until the
 * calendar turned the last one on. These cases are about *disabled-tile
 * behaviour* — which the component still implements, for the next app that
 * needs it — not about which app happens to be disabled, so borrowing a live
 * registry row was always the fragile part. A row that flips is a registry
 * decision; it should not take three unrelated tile tests with it.
 *
 * `unit: 'thread'` is stated because the real `social` row counts posts now,
 * and these assertions are about the count *rules*, not the noun.
 */
const SOON: MiniApp = { ...app('social'), enabled: false, unit: 'thread' }
describe('MiniAppTile', () => {
  it('renders an enabled tile as a real link to its mini-app', () => {
    render(<MiniAppTile app={app('copywriting')} brandId="b-1" threadCount={2} />)
    const link = screen.getByRole('link', { name: /Copywriting/ })
    expect(link.getAttribute('href')).toBe('/brands/b-1/apps/copywriting')
    expect(screen.queryByText('Soon')).toBeNull()
  })

  it('renders a disabled tile as inert, with a Soon pill and no link', () => {
    const { container } = render(<MiniAppTile app={SOON} brandId="b-1" threadCount={0} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Soon')).toBeTruthy()
    expect(container.querySelector('[aria-disabled="true"]')).toBeTruthy()
  })

  it('pluralises the thread count', () => {
    const { rerender } = render(
      <MiniAppTile app={app('copywriting')} brandId="b-1" threadCount={1} />,
    )
    expect(screen.getByText('1 thread')).toBeTruthy()

    rerender(<MiniAppTile app={app('copywriting')} brandId="b-1" threadCount={5} />)
    expect(screen.getByText('5 threads')).toBeTruthy()
  })

  it('shows no count while the thread list is unknown', () => {
    render(<MiniAppTile app={app('copywriting')} brandId="b-1" threadCount={null} />)
    expect(screen.queryByText(/thread/)).toBeNull()
  })

  // The counterpart to the count rule below: a Soon tile that reports threads
  // has to be openable, or it advertises data nothing can reach.
  it('links a Soon tile once it actually holds threads', () => {
    const { rerender } = render(<MiniAppTile app={SOON} brandId="b-1" threadCount={3} />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/brands/b-1/apps/social')
    expect(screen.getByText('Soon')).toBeTruthy()

    // Still inert with nothing behind it.
    rerender(<MiniAppTile app={SOON} brandId="b-1" threadCount={0} />)
    expect(screen.queryByRole('link')).toBeNull()

    // ...and while counts are unknown, since a link would be a guess.
    rerender(<MiniAppTile app={SOON} brandId="b-1" threadCount={null} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('suppresses a zero count on a Soon tile but not a real one', () => {
    const { rerender } = render(<MiniAppTile app={SOON} brandId="b-1" threadCount={0} />)
    expect(screen.queryByText(/thread/)).toBeNull()

    // A thread predating the tile going live still gets counted.
    rerender(<MiniAppTile app={SOON} brandId="b-1" threadCount={3} />)
    expect(screen.getByText('3 threads')).toBeTruthy()

    rerender(<MiniAppTile app={app('copywriting')} brandId="b-1" threadCount={0} />)
    expect(screen.getByText('0 threads')).toBeTruthy()
  })
})
