import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'

import { IdeaPage } from './idea-page'
import { resetIdeas, suggest } from './ideas-store'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/ideate/cv-blindfold',
  useRouter: () => ({ push }),
}))

beforeEach(() => {
  resetIdeas()
  push.mockClear()
})

const open = (id: string) =>
  render(
    <BrandProvider>
      <IdeaPage id={id} />
    </BrandProvider>,
  )

describe('an idea page', () => {
  it('shows the idea with its plan, shots and inspiration, and a way back to Current ideas', () => {
    open('cv-blindfold')
    expect(screen.getByLabelText('Hook')).toHaveValue('Blindfold pizza: the rematch.')
    expect(screen.getByRole('link', { name: 'Current ideas' })).toHaveAttribute(
      'href',
      '/ideate?view=ideas',
    )
    expect(screen.getByRole('radio', { name: 'Draft' })).toBeChecked()
    expect(screen.getByLabelText('Shot 1')).toHaveValue('Blindfold on')
    expect(screen.getByRole('region', { name: 'Inspiration' })).toBeInTheDocument()
  })

  it('makes the idea a post on the calendar when a status is picked, and ticks a shot', () => {
    open('cv-blindfold')
    fireEvent.click(screen.getByRole('radio', { name: 'Scheduled' }))
    expect(screen.getByRole('link', { name: /On the calendar · Fri 23 Oct/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in scheduler →' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Shot done: Blindfold on' }))
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  it('goes back to Current ideas when a suggestion is skipped, since the idea is gone', () => {
    // Skip deletes the card; staying would show "not here", which blames a reload.
    act(() => suggest('casa-vostra'))
    open('cv-s-dough-shift')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(push).toHaveBeenCalledWith('/ideate?view=ideas')
  })

  it('says so, quietly, for an idea it does not have', () => {
    open('nothing-here')
    expect(screen.getByText(/This idea is not here/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Current ideas' })).toBeInTheDocument()
  })
})
