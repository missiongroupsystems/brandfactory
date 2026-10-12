import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'

import { BrandPage } from './brand-page'
import { resetBrandKit } from './brand-store'
import { resetVoiceVersions } from './voice/versions'

vi.mock('next/navigation', () => ({
  usePathname: () => '/brand',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

beforeEach(() => {
  resetBrandKit()
  resetVoiceVersions()
})
afterEach(() => vi.useRealTimers())

const open = () =>
  render(
    <BrandProvider>
      <BrandPage />
    </BrandProvider>,
  )

const files = () => within(screen.getByRole('region', { name: 'Files' }))
const voice = () => within(screen.getByRole('region', { name: 'Voice' }))
// A desktop: the colour picker floats by its swatch and closes on a tap outside.
if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList
}
const tapOutside = () => fireEvent.pointerDown(document.body)

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
  // The voice changes through its flow: a few steps, then the proof, then Make this the voice.
  const step = () => {
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }))
    act(() => {
      vi.advanceTimersByTime(400)
    })
  }
  const makeItTheVoice = () => {
    fireEvent.click(screen.getByRole('button', { name: /Make this the voice/ }))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
  }

  it('saves a new voice as the brand’s voice', () => {
    vi.useFakeTimers()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'How the brand sounds' }), {
      target: { value: 'Short and bright. Never fussy.' },
    })
    step()
    step()
    step()
    makeItTheVoice()
    vi.useRealTimers()
    expect(voice().getByText('Short and bright. Never fussy.')).toBeInTheDocument()
  })

  it('removes a pair and adds one, and keeps neither change after Escape', () => {
    vi.useFakeTimers()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    step()
    fireEvent.click(screen.getByRole('button', { name: 'Remove wood-fired' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a pair' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Say 4' }), { target: { value: 'pasta' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Not 4' }), { target: { value: 'carbs' } })
    step()
    step()
    makeItTheVoice()
    expect(voice().queryByText('wood-fired')).not.toBeInTheDocument()
    expect(voice().getByText('carbs')).toBeInTheDocument()

    // Escape drops an edit in progress: the pair removed while open comes back.
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }))
    step()
    fireEvent.click(screen.getByRole('button', { name: 'Remove pasta' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Say 1' }), { key: 'Escape' })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    vi.useRealTimers()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(voice().getByText('pasta')).toBeInTheDocument()
  })

  it('changes a colour in the picker, and never saves a hex that is not one', () => {
    open()
    fireEvent.click(colours().getByRole('button', { name: 'Edit Terracotta, #D9572B' }))
    const picker = within(screen.getByRole('dialog', { name: 'Terracotta' }))
    fireEvent.change(picker.getByRole('textbox', { name: 'Hex' }), { target: { value: '#12ab' } })
    expect(picker.getByRole('textbox', { name: 'Hex' })).toHaveAttribute('aria-invalid', 'true')
    tapOutside()
    // A half-typed hex leaves the colour as it was.
    expect(colours().getByRole('button', { name: 'Edit Terracotta, #D9572B' })).toBeInTheDocument()

    fireEvent.click(colours().getByRole('button', { name: 'Edit Basil, #3E6B48' }))
    const basil = within(screen.getByRole('dialog', { name: 'Basil' }))
    fireEvent.change(basil.getByRole('textbox', { name: 'Hex' }), { target: { value: '2f5d3a' } })
    tapOutside()
    expect(colours().getByRole('button', { name: 'Edit Basil, #2F5D3A' })).toBeInTheDocument()
  })

  it('adds a named colour and removes another', () => {
    open()
    fireEvent.click(colours().getByRole('button', { name: 'Edit Char, #1E1A17' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Char' }))
    expect(colours().queryByText('Char')).not.toBeInTheDocument()

    fireEvent.click(colours().getByRole('button', { name: 'Add colour' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Colour name' }), {
      target: { value: 'Olive oil' },
    })
    tapOutside()
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
