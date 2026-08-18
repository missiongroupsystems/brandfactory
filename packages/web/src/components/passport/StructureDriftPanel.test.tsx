import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StructureDriftPanel } from './StructureDriftPanel'

/**
 * The drift view.
 *
 * Plan: phase 9e/9f. Decision: proposal §8 `D1-b`.
 *
 * ## What is worth asserting
 *
 * 1. **The two sections stay apart.** Divergence is expected and permanent; unlinked needs an
 *    Admin. Merged, dozens of correct rows bury the two that matter, and the screen stops
 *    being opened.
 * 2. **Divergence says "expected" in as many words**, or somebody spends an afternoon
 *    "fixing" thirty rows that are correct.
 * 3. **It renders nothing for somebody who cannot act**, including on a deployment with no
 *    Passport at all — which is every deployment today.
 * 4. **Promoting confirms first**, and the confirmation names the consequence outside this app.
 */

const h = vi.hoisted(() => ({
  permission: { canWriteStructure: true, organizationId: 'org-1' } as {
    canWriteStructure: boolean
    organizationId: string | null
  },
  drift: {
    diverged: [
      {
        brandId: 'b-1',
        displayName: 'Casa Vostra',
        legalName: 'Casa Vostra Pte. Ltd.',
        unitId: 'u-1',
      },
    ],
    unlinked: [{ brandId: 'b-2', displayName: 'Made During An Outage' }],
  },
  promote: vi.fn(),
  isPending: false,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/api/queries/passport', () => ({
  useStructurePermission: () => ({ data: h.permission }),
  useWorkspaceDrift: (_ws: string, enabled: boolean) => ({
    data: enabled ? h.drift : undefined,
    isLoading: false,
  }),
  usePromoteBrand: () => ({ mutate: h.promote, isPending: h.isPending }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => h.toastSuccess(...a),
    error: (...a: unknown[]) => h.toastError(...a),
  },
}))

describe('StructureDriftPanel', () => {
  beforeEach(() => {
    h.permission = { canWriteStructure: true, organizationId: 'org-1' }
    h.promote.mockReset()
    h.toastSuccess.mockReset()
    h.toastError.mockReset()
    h.isPending = false
  })

  it('keeps the two sections apart', () => {
    render(<StructureDriftPanel workspaceId="ws-1" />)
    expect(screen.getByText(/not in mission passport/i)).toBeTruthy()
    expect(screen.getByText(/different name in mission passport/i)).toBeTruthy()
  })

  it('says the divergence is EXPECTED', () => {
    // Without this the list reads as a set of faults, and somebody "fixes" thirty rows that
    // are correct by design.
    render(<StructureDriftPanel workspaceId="ws-1" />)
    expect(screen.getByText(/expected/i)).toBeTruthy()
  })

  it('offers the action only on the half that needs one', () => {
    render(<StructureDriftPanel workspaceId="ws-1" />)
    // One unlinked brand, one button. A diverged row has nothing to do.
    expect(screen.getAllByRole('button', { name: /add to passport/i })).toHaveLength(1)
  })

  it('⚠️ renders nothing for somebody who cannot act', () => {
    // Which is everybody, on every deployment with no Passport — i.e. all of them today. A
    // panel of things you cannot change is noise on everyone else's settings page.
    h.permission = { canWriteStructure: false, organizationId: null }
    const { container } = render(<StructureDriftPanel workspaceId="ws-1" />)
    expect(container.textContent).toBe('')
  })

  it('confirms before promoting, and names the consequence outside this app', async () => {
    render(<StructureDriftPanel workspaceId="ws-1" />)
    await userEvent.click(screen.getByRole('button', { name: /add to passport/i }))

    // The consequence nothing else in BrandFactory can claim.
    expect(await screen.findByText(/other mission systems apps/i)).toBeTruthy()
    expect(screen.getByText(/becomes its legal name/i)).toBeTruthy()
    expect(screen.getByText(/cannot undo this/i)).toBeTruthy()
    // Not yet sent.
    expect(h.promote).not.toHaveBeenCalled()
  })

  it('promotes only after the confirmation', async () => {
    render(<StructureDriftPanel workspaceId="ws-1" />)
    await userEvent.click(screen.getByRole('button', { name: /add to passport/i }))
    await userEvent.click(await screen.findByRole('button', { name: /^add to passport$/i }))

    await waitFor(() => expect(h.promote).toHaveBeenCalled())
    expect(h.promote.mock.calls[0]?.[0]).toBe('b-2')
  })

  it('reports the result as PENDING, never as done', async () => {
    // The link arrives by event a moment later. Claiming it is done would be wrong for about a
    // second, and the row would then "correct" itself in a way that reads as a bug.
    h.promote.mockImplementation((_id: string, opts: { onSuccess: (r: unknown) => void }) => {
      opts.onSuccess({ brandId: 'b-2', unitId: 'u-2', pending: true })
    })
    render(<StructureDriftPanel workspaceId="ws-1" />)
    await userEvent.click(screen.getByRole('button', { name: /add to passport/i }))
    await userEvent.click(await screen.findByRole('button', { name: /^add to passport$/i }))

    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled())
    expect(String(h.toastSuccess.mock.calls[0]?.[0])).toMatch(/being added|shortly/i)
  })

  it('surfaces the server’s own message on a failure', async () => {
    // "Only an Owner or Admin", "sign in with your Passport account", "temporarily
    // read-only" — these are the messages a person can act on, and replacing them with a
    // generic failure discards the whole point of mapping Passport's statuses.
    h.promote.mockImplementation((_id: string, opts: { onError: (e: unknown) => void }) => {
      opts.onError(new Error('Only an organisation Owner or Admin may change structure.'))
    })
    render(<StructureDriftPanel workspaceId="ws-1" />)
    await userEvent.click(screen.getByRole('button', { name: /add to passport/i }))
    await userEvent.click(await screen.findByRole('button', { name: /^add to passport$/i }))

    await waitFor(() => expect(h.toastError).toHaveBeenCalled())
    expect(String(h.toastError.mock.calls[0]?.[0])).toMatch(/Owner or Admin/)
  })
})
