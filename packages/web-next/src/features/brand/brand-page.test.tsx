import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'

import { BrandPage } from './brand-page'
import { resetBrandKit } from './brand-store'
import { VoiceNote } from './voice-note'

vi.mock('next/navigation', () => ({
  usePathname: () => '/brand',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

beforeEach(() => resetBrandKit())

const open = () =>
  render(
    <BrandProvider>
      <BrandPage />
    </BrandProvider>,
  )

const files = () => within(screen.getByRole('region', { name: 'Files' }))
const voice = () => within(screen.getByRole('region', { name: 'Voice' }))
const colours = () => within(screen.getByRole('region', { name: 'Colours' }))

describe('the brand page', () => {
  it('opens an upload for a plain title, and keeps the title the team types', () => {
    open()
    const file = new File(['x'], 'CV_menu-autumn.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Upload a file'), { target: { files: [file] } })
    const title = screen.getByRole('textbox', { name: 'File title' })
    expect(title).toHaveValue('CV menu autumn')
    fireEvent.change(title, { target: { value: 'Autumn menu' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    expect(files().getByText('Autumn menu')).toBeInTheDocument()
    expect(files().getByText('Updated today · CV_menu-autumn.pdf')).toBeInTheDocument()
  })

  it('deletes a file from its menu', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'More for Brand book' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(files().queryByText('Brand book')).not.toBeInTheDocument()
  })
})

describe('editing the kit', () => {
  it('saves a new voice where AI drafts read it, beside the composer’s AI button', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'How the brand sounds' }), {
      target: { value: 'Short and bright. Never fussy.' },
    })
    fireEvent.click(voice().getByRole('button', { name: 'Done' }))
    expect(voice().getByText('Short and bright. Never fussy.')).toBeInTheDocument()

    render(
      <BrandProvider>
        <VoiceNote />
      </BrandProvider>,
    )
    expect(screen.getByRole('link', { name: 'In Casa Vostra’s voice' })).toHaveAttribute(
      'title',
      'Short and bright. Never fussy.',
    )
  })

  it('removes a pair and adds one, and keeps neither change after Escape', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove wood-fired' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a pair' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Say 4' }), { target: { value: 'pasta' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Not 4' }), { target: { value: 'carbs' } })
    fireEvent.click(voice().getByRole('button', { name: 'Done' }))
    expect(voice().queryByText('wood-fired')).not.toBeInTheDocument()
    expect(voice().getByText('carbs')).toBeInTheDocument()

    // Escape drops an edit in progress: the pair removed while open comes back.
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove pasta' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'How the brand sounds' }), {
      key: 'Escape',
    })
    expect(voice().getByText('pasta')).toBeInTheDocument()
  })

  it('changes a colour by its hex, and never saves a hex that is not one', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit colours' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Terracotta hex' }), {
      target: { value: '#12ab' },
    })
    expect(screen.getByRole('textbox', { name: 'Terracotta hex' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Basil hex' }), {
      target: { value: '2f5d3a' },
    })
    fireEvent.click(colours().getByRole('button', { name: 'Done' }))
    expect(colours().getByRole('button', { name: 'Copy Terracotta, #D9572B' })).toBeInTheDocument()
    expect(colours().getByRole('button', { name: 'Copy Basil, #2F5D3A' })).toBeInTheDocument()
  })

  it('adds a named colour and removes another', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit colours' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Char' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add colour' }))
    const names = screen.getAllByRole('textbox', { name: 'Colour name' })
    fireEvent.change(names[names.length - 1]!, { target: { value: 'Olive oil' } })
    fireEvent.click(colours().getByRole('button', { name: 'Done' }))
    expect(colours().queryByText('Char')).not.toBeInTheDocument()
    expect(colours().getByText('Olive oil')).toBeInTheDocument()
  })

  it('replaces the logo with the file the team picks', () => {
    // jsdom has no object URLs; a stub stands in for the browser's.
    ;(URL as { createObjectURL?: (f: Blob) => string }).createObjectURL = () => 'blob:new-logo'
    open()
    const file = new File(['x'], 'casa-mark-2026.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Upload a new logo'), { target: { files: [file] } })
    const logo = within(screen.getByRole('region', { name: 'Logo' }))
    expect(logo.getByRole('img', { name: 'Casa Vostra logo' })).toHaveAttribute(
      'src',
      'blob:new-logo',
    )
    expect(logo.getByText('Updated today · casa-mark-2026.png')).toBeInTheDocument()
  })
})
