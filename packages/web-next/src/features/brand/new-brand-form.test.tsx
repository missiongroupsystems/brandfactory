import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Company, RemoteError } from '@/lib/remote'

import { NewBrandForm } from './new-brand-form'

// The upload goes to the core; the brand itself is made by the provider (`onAdd`).
const mocks = vi.hoisted(() => ({ upload: vi.fn(async () => '/files/logo.png#photo') }))
vi.mock('@/lib/remote', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  upload: mocks.upload,
}))

const demo = { id: 'demo', name: 'Demo', role: 'owner' as const }
const other = { id: 'other', name: 'Other', role: 'admin' as const }

beforeEach(() => {
  mocks.upload.mockReset().mockResolvedValue('/files/logo.png#photo')
  // jsdom has no object URLs; the picked image only needs an address.
  URL.createObjectURL = vi.fn(() => 'blob:logo')
  URL.revokeObjectURL = vi.fn()
})

function open(companies: Company[] = [demo], onAdd = vi.fn(async () => 'lucali')) {
  const onClose = vi.fn()
  render(<NewBrandForm companies={companies} onAdd={onAdd} onClose={onClose} />)
  return { onAdd, onClose }
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add brand' }))
const logo = new File(['x'], 'mark.png', { type: 'image/png' })
const pickLogo = () =>
  fireEvent.change(screen.getByLabelText('Logo file'), { target: { files: [logo] } })
const dialog = () => within(screen.getByRole('dialog', { name: 'New brand' }))

describe('the new brand form', () => {
  it('asks which company only when there is more than one, and starts at the name', () => {
    open()
    expect(screen.queryByRole('radiogroup', { name: 'Company' })).toBeNull()
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('draws the brand as the person types: initials, name, handle, channels, id', () => {
    open()
    expect(dialog().getByText('Your brand')).toBeInTheDocument()
    type('Name', 'Casa Nostra')
    type('Handle', 'casanostra')
    fireEvent.click(screen.getByRole('checkbox', { name: 'TikTok' }))
    const well = screen.getByRole('button', { name: 'Add a logo' })
    expect(well).toHaveTextContent('CN')
    expect(dialog().getByText('Casa Nostra')).toBeInTheDocument()
    expect(dialog().getByText('@casanostra')).toBeInTheDocument()
    expect(dialog().getByText('brandbase / casa-nostra')).toBeInTheDocument()
  })

  it('shows a picked logo at once, and lets it go again', () => {
    open()
    pickLogo()
    const well = screen.getByRole('button', { name: 'Change the logo' })
    expect(within(well).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      'blob:logo',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove the logo' }))
    expect(screen.getByRole('button', { name: 'Add a logo' })).toBeInTheDocument()
  })

  it('keeps the line, the colours and the timezone folded until asked for', () => {
    open()
    expect(screen.queryByLabelText('One line about the brand')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }))
    expect(screen.getByLabelText('One line about the brand')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a line' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Colours' }))
    expect(screen.getByRole('button', { name: 'Add colour' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Asia\/Singapore/ }))
    expect(screen.getByRole('combobox')).toHaveValue('Asia/Singapore')
  })

  it('sends the brand to the chosen company, with the handle as the core wants it', async () => {
    const { onAdd, onClose } = open([demo, other])
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }))
    type('Name', ' Lucali ')
    type('Handle', 'lucali')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Instagram' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'TikTok' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Instagram' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }))
    type('One line about the brand', ' Pizza. ')
    await act(async () => add())
    expect(onAdd).toHaveBeenCalledWith({
      org: 'other',
      name: 'Lucali',
      handle: '@lucali',
      linked: ['tt'],
      line: 'Pizza.',
    })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('puts the logo on the brand once it exists, then opens it', async () => {
    const { onClose } = open()
    type('Name', 'Lucali')
    type('Handle', '@lucali')
    pickLogo()
    await act(async () => add())
    expect(mocks.upload).toHaveBeenCalledWith('lucali', logo)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the brand when only the logo fails, and tries the logo again', async () => {
    mocks.upload.mockRejectedValueOnce(new RemoteError(502, 'UPLOAD', 'The file did not upload.'))
    const { onAdd, onClose } = open()
    type('Name', 'Lucali')
    type('Handle', '@lucali')
    pickLogo()
    await act(async () => add())
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Lucali is in. The logo did not upload.')
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(mocks.upload).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cannot be sent until the brand has a name', async () => {
    const { onAdd } = open()
    type('Handle', '@lucali')
    type('Name', '  ')
    expect(screen.getByRole('button', { name: 'Add brand' })).toBeDisabled()
    await act(async () => add())
    expect(onAdd).not.toHaveBeenCalled()
    type('Name', 'Lucali')
    expect(screen.getByRole('button', { name: 'Add brand' })).toBeEnabled()
  })

  it('shows the refusal and stays open, so the person can change the name', async () => {
    const refuse = vi.fn(async () => {
      throw new RemoteError(409, 'BRAND_TAKEN', 'exists')
    })
    const { onClose } = open([demo], refuse)
    type('Name', 'Casa Vostra')
    type('Handle', '@casavostrasg')
    await act(async () => add())
    expect(screen.getByRole('alert')).toHaveTextContent('A brand with this name exists.')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Add brand' })).toBeEnabled()
    // The refusal was about that name; a new one starts clean.
    type('Name', 'Casa Nostra')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('closes on Escape', () => {
    const { onClose } = open()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
