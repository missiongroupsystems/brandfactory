import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetConnections } from '@/features/connections/connections-store'
import { BrandProvider } from '@/features/schedule/posts-store'

import { NewMenu } from './new-menu'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const onPost = vi.fn()
beforeEach(() => {
  resetConnections()
  onPost.mockClear()
})

const open = (compact = false) => {
  render(
    <BrandProvider>
      <NewMenu onPost={onPost} compact={compact} />
    </BrandProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'New' }))
  return screen.getByRole('menu', { name: 'New' })
}

describe('the New menu', () => {
  it('takes the keys: the focus on the first row, Up and Down round the ends, Escape back to New', () => {
    render(
      <BrandProvider>
        <NewMenu onPost={onPost} />
      </BrandProvider>,
    )
    const button = screen.getByRole('button', { name: 'New' })
    button.focus()
    fireEvent.click(button)
    const row = (name: string) => screen.getByRole('menuitem', { name })
    expect(row('Post')).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(row('Reel')).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(row('Story')).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(button).toHaveFocus()
  })

  it('offers a post, a reel or a story, each with the accounts that post it, and starts the one picked', () => {
    const menu = open()
    const rows = within(menu).getAllByRole('menuitem')
    expect(rows.map((r) => r.textContent)).toEqual(['Post', 'Reel', 'Story'])
    // In the demo every account posts; a Story goes to Instagram and Facebook, never TikTok.
    expect(rows[0]!.querySelectorAll('svg')).toHaveLength(3)
    expect(rows[2]!.querySelectorAll('svg')).toHaveLength(2)
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Reel' }))
    expect(onPost).toHaveBeenCalledWith('reel')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('adds a shoot on a phone, after the formats', () => {
    const menu = open(true)
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((r) => r.textContent),
    ).toEqual(['Post', 'Reel', 'Story', 'Shoot'])
  })
})
