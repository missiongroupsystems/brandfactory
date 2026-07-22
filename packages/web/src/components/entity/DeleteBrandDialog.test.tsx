import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteBrandDialog } from './DeleteBrandDialog'

describe('DeleteBrandDialog', () => {
  it('keeps the destructive action disabled until the brand name is typed', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <DeleteBrandDialog
        open
        onOpenChange={() => undefined}
        brandName="Acme Coffee"
        projectCount={4}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByText(/This deletes 4 projects/)).toBeTruthy()
    const del = screen.getByRole('button', { name: 'Delete brand' })
    expect(del.hasAttribute('disabled')).toBe(true)

    await user.type(screen.getByLabelText('Brand name'), 'Acme')
    expect(del.hasAttribute('disabled')).toBe(true)

    await user.clear(screen.getByLabelText('Brand name'))
    await user.type(screen.getByLabelText('Brand name'), 'Acme Coffee')
    expect(del.hasAttribute('disabled')).toBe(false)

    await user.click(del)
    expect(onConfirm).toHaveBeenCalled()
  })
})
