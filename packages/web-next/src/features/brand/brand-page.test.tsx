import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '@/features/schedule/posts-store'

import { BrandPage } from './brand-page'
import { resetBrandFiles } from './brand-store'

vi.mock('next/navigation', () => ({
  usePathname: () => '/brand',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

beforeEach(() => resetBrandFiles())

const open = () =>
  render(
    <BrandProvider>
      <BrandPage />
    </BrandProvider>,
  )

const files = () => within(screen.getByRole('region', { name: 'Files' }))

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
