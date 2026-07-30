import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NewBrandDialog } from './NewBrandDialog'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// NewBrandDialog — extracted from `routes/workspaces.$wsId.index.tsx`
// ---------------------------------------------------------------------------
//
// It shipped inside the route with no tests of its own, which was survivable
// while the route was its only caller. `BrandSwitcher` is now a second one, and
// the two use opposite halves of the component: the route hands it a trigger,
// the switcher drives `open` from a menu item. Both are pinned here.
//
// `normalizeWebsiteUrl` is *not* mocked — it is pure, and the reason it exists
// is that the form rejects `javascript:alert(1)` before it can reach an `href`.
// A mock would test the mock.

const navigate = vi.fn()
const post = vi.fn()
const toastError = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}))

class FakeAppError extends Error {}

vi.mock('@/api/client', () => ({
  api: {
    workspaces: {
      ':workspaceId': { brands: { $post: (...args: unknown[]) => post(...args) } },
    },
  },
  // The real one parses a Response; the fake `$post` already resolves the body.
  callJson: (res: unknown) => res,
  get AppError() {
    return FakeAppError
  },
}))

vi.mock('@/api/queries/workspaces', () => ({
  workspaceKeys: { brands: (id: string) => ['workspaces', id, 'brands'] },
}))

let qc: QueryClient

function renderDialog(props: Partial<Parameters<typeof NewBrandDialog>[0]> = {}) {
  return render(
    <QueryClientProvider client={qc}>
      <NewBrandDialog wsId="ws-1" {...props} />
    </QueryClientProvider>,
  )
}

describe('NewBrandDialog', () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    navigate.mockReset()
    toastError.mockReset()
    post.mockReset()
    post.mockResolvedValue({ id: 'b-new' })
  })

  it('opens from its own trigger when given one', async () => {
    const user = userEvent.setup()
    renderDialog({ trigger: <Button size="sm">+ Brand</Button> })

    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: '+ Brand' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  // The switcher's half: a menu item is the opener, so there is no trigger to
  // render — and rendering one would put a stray button in the header.
  it('renders no trigger when driven by `open`', () => {
    renderDialog({ open: true, onOpenChange: () => undefined })

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '+ Brand' })).toBeNull()
  })

  it('disables create until a name is entered', async () => {
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: () => undefined })

    const create = screen.getByRole('button', { name: 'Create' })
    expect(create.hasAttribute('disabled')).toBe(true)

    await user.type(screen.getByLabelText('Name'), 'Casa Vostra')
    expect(create.hasAttribute('disabled')).toBe(false)
  })

  it('posts a trimmed name and omits the optional fields left blank', async () => {
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: () => undefined })

    await user.type(screen.getByLabelText('Name'), '  Casa Vostra  ')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith({
        param: { workspaceId: 'ws-1' },
        json: { name: 'Casa Vostra' },
      })
    })
  })

  it('sends the description and a scheme-completed website when supplied', async () => {
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: () => undefined })

    await user.type(screen.getByLabelText('Name'), 'Casa Vostra')
    await user.type(screen.getByLabelText('Description (optional)'), 'Neapolitan pizza')
    await user.type(screen.getByLabelText('Website (optional)'), 'casavostra.com')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith({
        param: { workspaceId: 'ws-1' },
        json: {
          name: 'Casa Vostra',
          description: 'Neapolitan pizza',
          websiteUrl: 'https://casavostra.com',
        },
      })
    })
  })

  // 1A's stored-XSS gate, from the form's side: the value ends up in an `href`.
  it('reports a non-http scheme in the form and posts nothing', async () => {
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: () => undefined })

    await user.type(screen.getByLabelText('Name'), 'Casa Vostra')
    await user.type(screen.getByLabelText('Website (optional)'), 'javascript:alert(1)')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText(/starting with http/)).toBeTruthy()
    expect(post).not.toHaveBeenCalled()
  })

  it('navigates to the new brand hub on success', async () => {
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: () => undefined })

    await user.type(screen.getByLabelText('Name'), 'Casa Vostra')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: '/brands/$brandId',
        params: { brandId: 'b-new' },
      })
    })
  })

  it('toasts on failure', async () => {
    post.mockRejectedValue(new FakeAppError('Name already taken'))
    const user = userEvent.setup()
    renderDialog({ open: true, onOpenChange: () => undefined })

    await user.type(screen.getByLabelText('Name'), 'Casa Vostra')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Name already taken')
    })
    expect(navigate).not.toHaveBeenCalled()
  })

  // Reachable from every page in a brand since the switcher item landed, so a
  // cancelled attempt must not hand the next one a half-typed name — nor a
  // website error about a field that is now empty.
  it('clears the form on close, not only on success', async () => {
    const user = userEvent.setup()
    renderDialog({ trigger: <Button size="sm">+ Brand</Button> })

    await user.click(screen.getByRole('button', { name: '+ Brand' }))
    await user.type(await screen.findByLabelText('Name'), 'Half typed')
    await user.type(screen.getByLabelText('Website (optional)'), 'javascript:alert(1)')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText(/starting with http/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: '+ Brand' }))
    expect(await screen.findByLabelText('Name')).toHaveProperty('value', '')
    expect(screen.getByLabelText('Website (optional)')).toHaveProperty('value', '')
    expect(screen.queryByText(/starting with http/)).toBeNull()
  })
})
