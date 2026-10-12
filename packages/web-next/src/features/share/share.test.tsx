import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetIdeas } from '@/features/ideate/ideas-store'
import { BrandProvider } from '@/features/schedule/posts-store'
import { ShootPage } from '@/features/shoot/shoot-page'
import { resetShoots } from '@/features/shoot/shoots-store'

import { addComment, resetComments } from './comments-store'
import { ShareButton } from './share-button'
import { SharedIdea, SharedShoot } from './share-page'

vi.mock('next/navigation', () => ({
  usePathname: () => '/share/shoot/cv-shoot-raffles',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}

beforeEach(() => {
  resetIdeas()
  resetShoots()
  resetComments()
})

describe('a shared shoot', () => {
  it('shows the call sheet to a guest with no app navigation, and their comment reaches the team', () => {
    const { unmount } = render(
      <BrandProvider>
        <SharedShoot id="cv-shoot-raffles" />
      </BrandProvider>,
    )
    // Read-only: when, where, who, and the shot list from both ideas' storyboards.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wed 7 Oct, 12:00–17:00')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    const list = screen.getByRole('region', { name: 'Shot list' })
    expect(within(list).getByText('Flour and eggs, overhead')).toBeInTheDocument()
    expect(within(list).getByText('Bibs on the table')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()

    // A name and the words are all a guest needs; neither alone posts anything.
    const send = screen.getByRole('button', { name: 'Comment' })
    fireEvent.change(screen.getByLabelText('Comment'), {
      target: { value: 'Shoot the bowl first?' },
    })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Chef Marco' } })
    fireEvent.click(send)
    expect(screen.getByText('Shoot the bowl first?')).toBeInTheDocument()
    unmount()

    // The team's call sheet shows the same thread.
    render(
      <BrandProvider>
        <ShootPage id="cv-shoot-raffles" />
      </BrandProvider>,
    )
    const thread = screen.getByRole('region', { name: 'Comments' })
    expect(within(thread).getByText('Shoot the bowl first?')).toBeInTheDocument()
    expect(within(thread).getByText('Chef Marco')).toBeInTheDocument()
  })
})

describe('a shared idea', () => {
  it('shows the brief and its storyboard, and keeps comments to that idea', () => {
    addComment('idea', 'cv-dough', 'Jules', 'Overhead first.')
    render(
      <BrandProvider>
        <SharedIdea id="cv-blindfold" />
      </BrandProvider>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Blindfold pizza: the rematch.',
    )
    expect(screen.getByText('Blindfold on')).toBeInTheDocument()
    expect(screen.queryByText('Overhead first.')).not.toBeInTheDocument()
  })

  it('says so when the link points at nothing', () => {
    render(
      <BrandProvider>
        <SharedIdea id="gone" />
      </BrandProvider>,
    )
    expect(screen.getByText(/nothing to show/)).toBeInTheDocument()
  })
})

describe('who a link opens for', () => {
  it('lets the team choose view, comment, edit or team only, and the guest page follows', () => {
    render(
      <BrandProvider>
        <ShareButton kind="idea" id="cv-blindfold" />
        <SharedIdea id="cv-blindfold" />
      </BrandProvider>,
    )
    // A new link: anyone may comment, and nobody edits.
    expect(screen.getByRole('button', { name: 'Comment' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const can = screen.getByRole('combobox', { name: 'What they can do' })
    fireEvent.change(can, { target: { value: 'view' } })
    expect(screen.queryByRole('button', { name: 'Comment' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()

    fireEvent.change(can, { target: { value: 'edit' } })
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/ideate/cv-blindfold',
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Who can open the link' }), {
      target: { value: 'team' },
    })
    expect(screen.getByText(/only for the Casa Vostra team/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'What they can do' })).not.toBeInTheDocument()
  })
})
