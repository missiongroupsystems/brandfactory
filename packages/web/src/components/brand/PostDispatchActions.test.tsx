import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SocialPost } from '@brandfactory/shared'
import { hasDispatchActions, PostDispatchActions } from './PostDispatchActions'

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

function post(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'p-1' as SocialPost['id'],
    brandId: 'b-1' as SocialPost['brandId'],
    platform: 'instagram',
    scheduledAt: null,
    body: 'Sunday roast, from three o’clock.',
    status: 'draft',
    createdBy: 'user',
    assetIds: [],
    deletedAt: null,
    ...STAMPS,
    ...overrides,
  }
}

function setup(props: Partial<React.ComponentProps<typeof PostDispatchActions>> = {}) {
  const onCopyBody = vi.fn().mockResolvedValue(undefined)
  const onDownloadAssets = vi.fn()
  render(
    <PostDispatchActions
      post={post()}
      excerpt="Sunday roast"
      variant="buttons"
      canDownload
      onCopyBody={onCopyBody}
      onDownloadAssets={onDownloadAssets}
      {...props}
    />,
  )
  return { onCopyBody, onDownloadAssets }
}

describe('PostDispatchActions — which controls exist', () => {
  it('offers both when there is copy to take and a file to save', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Copy Sunday roast' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Download attachments for Sunday roast' }),
    ).toBeTruthy()
  })

  it('offers no Copy on a post with no copy written yet', () => {
    // A control that does nothing is the dead affordance 1.7.0 went to remove.
    setup({ post: post({ body: '' }) })
    expect(screen.queryByRole('button', { name: /^Copy/ })).toBeNull()
  })

  it('offers no Copy on a body that is only whitespace', () => {
    setup({ post: post({ body: '   \n ' }) })
    expect(screen.queryByRole('button', { name: /^Copy/ })).toBeNull()
  })

  it('offers no Download on a post with no file behind it', () => {
    setup({ canDownload: false })
    expect(screen.queryByRole('button', { name: /^Download/ })).toBeNull()
  })

  it('renders nothing at all when the caller passes no callbacks', () => {
    const { container } = render(
      <PostDispatchActions post={post()} excerpt="Sunday roast" variant="buttons" canDownload />,
    )
    expect(container.innerHTML).toBe('')
  })
})

describe('PostDispatchActions — copying', () => {
  it('reports the post and confirms, then goes back to Copy', async () => {
    const user = userEvent.setup()
    const { onCopyBody } = setup()

    await user.click(screen.getByRole('button', { name: 'Copy Sunday roast' }))

    await waitFor(() => expect(onCopyBody).toHaveBeenCalledTimes(1))
    expect(onCopyBody.mock.calls[0]?.[0]).toMatchObject({ id: 'p-1' })
    // The visible word and the accessible name move together, so the label
    // stays inside the name while the transient is up.
    expect(await screen.findByRole('button', { name: 'Copied Sunday roast' })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy Sunday roast' })), {
      timeout: 2000,
    })
  })

  it('renders no error when the clipboard refuses', async () => {
    const user = userEvent.setup()
    const onCopyBody = vi.fn().mockRejectedValue(new Error('permission denied'))
    setup({ onCopyBody })

    await user.click(screen.getByRole('button', { name: 'Copy Sunday roast' }))

    await waitFor(() => expect(onCopyBody).toHaveBeenCalledTimes(1))
    // The clipboard is permission-gated and can simply say no. The copy is on
    // screen either way, so a refusal is not worth an error state — and it must
    // not claim a copy that did not happen.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Copied/ })).toBeNull()
  })

  it('reports the post when Download is pressed', async () => {
    const user = userEvent.setup()
    const { onDownloadAssets } = setup()

    await user.click(screen.getByRole('button', { name: 'Download attachments for Sunday roast' }))

    expect(onDownloadAssets).toHaveBeenCalledTimes(1)
    expect(onDownloadAssets.mock.calls[0]?.[0]).toMatchObject({ id: 'p-1' })
  })
})

describe('hasDispatchActions', () => {
  // The row menu asks the same question to decide whether it would be an empty
  // menu, so the rule is one function rather than two that drift.
  const both = { post: post(), canDownload: true, onCopyBody: vi.fn(), onDownloadAssets: vi.fn() }

  it('is true when either action is available', () => {
    expect(hasDispatchActions(both)).toBe(true)
    expect(hasDispatchActions({ ...both, canDownload: false })).toBe(true)
    expect(hasDispatchActions({ ...both, post: post({ body: '' }) })).toBe(true)
  })

  it('is false when neither is', () => {
    expect(hasDispatchActions({ ...both, post: post({ body: '' }), canDownload: false })).toBe(
      false,
    )
    expect(hasDispatchActions({ post: post(), canDownload: true })).toBe(false)
  })
})
