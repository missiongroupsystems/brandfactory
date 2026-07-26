import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewProjectDialog } from './NewProjectDialog'

const navigate = vi.fn()
const mutate = vi.fn()
const toastError = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/api/queries/projects', () => ({
  useCreateProject: () => ({
    mutate,
    isPending: false,
  }),
}))

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}))

describe('NewProjectDialog', () => {
  beforeEach(() => {
    navigate.mockReset()
    mutate.mockReset()
    toastError.mockReset()
  })

  it('disables create until a name is entered', async () => {
    const user = userEvent.setup()
    render(
      <NewProjectDialog brandId="b-1" workspaceId="ws-1" open onOpenChange={() => undefined} />,
    )

    const create = screen.getByRole('button', { name: 'Create' })
    expect(create.hasAttribute('disabled')).toBe(true)

    await user.type(screen.getByLabelText('Name'), 'Campaign')
    expect(create.hasAttribute('disabled')).toBe(false)
  })

  it('navigates to the new project on success', async () => {
    mutate.mockImplementation(
      (_arg: { name: string }, opts: { onSuccess: (p: { id: string }) => void }) => {
        opts.onSuccess({ id: 'p-new' })
      },
    )
    const user = userEvent.setup()
    render(
      <NewProjectDialog brandId="b-1" workspaceId="ws-1" open onOpenChange={() => undefined} />,
    )

    await user.type(screen.getByLabelText('Name'), 'Campaign')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(mutate).toHaveBeenCalledWith({ name: 'Campaign' }, expect.any(Object))
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: '/projects/$projectId',
        params: { projectId: 'p-new' },
      })
    })
  })

  it('tags the create with a templateId when a mini-app supplies one', async () => {
    mutate.mockImplementation(
      (_arg: { name: string }, opts: { onSuccess: (p: { id: string }) => void }) => {
        opts.onSuccess({ id: 'p-new' })
      },
    )
    const user = userEvent.setup()
    render(
      <NewProjectDialog
        brandId="b-1"
        workspaceId="ws-1"
        templateId="copywriting"
        title="New thread"
        open
        onOpenChange={() => undefined}
      />,
    )

    expect(screen.getByText('New thread')).toBeTruthy()
    await user.type(screen.getByLabelText('Name'), 'Taglines')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(mutate).toHaveBeenCalledWith(
      { name: 'Taglines', templateId: 'copywriting' },
      expect.any(Object),
    )
  })

  it('toasts on error', async () => {
    mutate.mockImplementation((_arg: { name: string }, opts: { onError: (e: Error) => void }) => {
      opts.onError(new Error('boom'))
    })
    const user = userEvent.setup()
    render(
      <NewProjectDialog brandId="b-1" workspaceId="ws-1" open onOpenChange={() => undefined} />,
    )

    await user.type(screen.getByLabelText('Name'), 'Campaign')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled()
    })
  })
})
