import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IdeatePage } from '@/features/ideate/ideate-page'
import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'

import { resetShoots, shootOfIdea, useShoots } from './shoots-store'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/ideate',
  useRouter: () => ({ push, replace: vi.fn() }),
}))

beforeEach(() => {
  resetIdeas()
  resetShoots()
  push.mockClear()
})

describe('planning a shoot from ideas', () => {
  it('groups the picked ideas into one shoot and opens its call sheet', () => {
    render(
      <BrandProvider>
        <IdeatePage view="ideas" />
      </BrandProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    // While picking, a card picks instead of opening its page.
    fireEvent.click(screen.getByRole('button', { name: 'Shoot: Blindfold pizza: the rematch.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Shoot: The pizza that stares back.' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Plan a shoot' }))

    const shoots = renderHook(() => useShoots('casa-vostra')).result.current
    const made = shootOfIdea(shoots, 'cv-blindfold')!
    expect(made.ideaIds).toEqual(['cv-blindfold', 'cv-stares-back'])
    expect(push).toHaveBeenCalledWith(`/shoot/${made.id}`)
  })
})
