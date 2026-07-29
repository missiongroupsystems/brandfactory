import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RenameDialog } from './RenameDialog'

function open(props: Partial<React.ComponentProps<typeof RenameDialog>> = {}) {
  const onSubmit = vi.fn()
  render(
    <RenameDialog
      open
      onOpenChange={vi.fn()}
      resource="brand"
      initialName="Casa Vostra"
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit }
}

describe('RenameDialog — brand website', () => {
  // The brand's only edit surface. Without the field here a brand created
  // without a website could never acquire one.
  it('seeds the field from the brand and submits it unchanged', async () => {
    const { onSubmit } = open({ initialWebsiteUrl: 'https://casavostra.com' })

    const input = screen.getByLabelText('Website (optional)')
    expect((input as HTMLInputElement).value).toBe('https://casavostra.com')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Casa Vostra', websiteUrl: 'https://casavostra.com' }),
    )
  })

  it('normalises a bare host to https', async () => {
    const { onSubmit } = open()

    await userEvent.type(screen.getByLabelText('Website (optional)'), 'casavostra.com')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ websiteUrl: 'https://casavostra.com' }),
    )
  })

  it('submits null for an emptied field, which is how a website is removed', async () => {
    const { onSubmit } = open({ initialWebsiteUrl: 'https://casavostra.com' })

    await userEvent.clear(screen.getByLabelText('Website (optional)'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ websiteUrl: null }))
  })

  // The server rejects this with a 400 either way; the point of the client
  // check is that the user is told in the form instead of through a toast
  // carrying a zod message — and that the mutation never fires.
  it('blocks submit and explains itself on a non-http URL', async () => {
    const { onSubmit } = open()

    await userEvent.type(screen.getByLabelText('Website (optional)'), 'javascript:alert(1)')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/starting with http/)).toBeTruthy()

    // Editing clears the error rather than leaving it under a corrected value.
    await userEvent.clear(screen.getByLabelText('Website (optional)'))
    expect(screen.queryByText(/starting with http/)).toBeNull()
  })

  // The field is brand-only: `RenameDialog` also renames workspaces and
  // projects, neither of which has a website.
  it('is absent for a workspace', () => {
    open({ resource: 'workspace', initialName: 'Mission Group' })
    expect(screen.queryByLabelText('Website (optional)')).toBeNull()
  })
})
