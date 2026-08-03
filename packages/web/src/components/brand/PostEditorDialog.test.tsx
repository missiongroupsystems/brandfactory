import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandAsset, SocialPost } from '@brandfactory/shared'
import { PostEditorDialog } from './PostEditorDialog'
import { isoToLocalParts, localPartsToIso } from '@/lib/calendar'

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

function asset(id: string, label: string): BrandAsset {
  return {
    id: id as BrandAsset['id'],
    brandId: 'b-1' as BrandAsset['brandId'],
    kind: 'image',
    source: 'blob',
    role: null,
    status: 'active',
    label,
    blobKey: `k-${id}`,
    position: 100,
    deletedAt: null,
    ...STAMPS,
  }
}

const kitchen = asset('a-1', 'The kitchen')
const terrace = asset('a-2', 'Terrace at dusk')

/** A post at a **local** wall-clock time, stated the way the wire states it. */
function post(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'p-1' as SocialPost['id'],
    brandId: 'b-1' as SocialPost['brandId'],
    platform: 'instagram',
    scheduledAt: new Date(2026, 7, 3, 9, 0).toISOString(),
    body: 'Sunday roast, from three o’clock.',
    status: 'draft',
    assetIds: [],
    deletedAt: null,
    ...STAMPS,
    ...overrides,
  }
}

const resolve = (key: string) => `/blob/${key}`

function setup(props: Partial<React.ComponentProps<typeof PostEditorDialog>> = {}) {
  const onCreate = vi.fn()
  const onUpdate = vi.fn()
  const onOpenChange = vi.fn()
  const view = render(
    <PostEditorDialog
      open
      onOpenChange={onOpenChange}
      assets={[kitchen, terrace]}
      resolveBlob={resolve}
      onCreate={onCreate}
      onUpdate={onUpdate}
      {...props}
    />,
  )
  return { onCreate, onUpdate, onOpenChange, view }
}

/** Radix's select, driven the way a person drives it. */
async function choose(user: ReturnType<typeof userEvent.setup>, trigger: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: trigger }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('PostEditorDialog — create', () => {
  it('will not create a post without a platform', async () => {
    const user = userEvent.setup()
    const { onCreate } = setup()

    await user.click(screen.getByRole('button', { name: 'Create post' }))

    expect(await screen.findByText('Choose where this post goes.')).toBeTruthy()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('seeds the clicked day at the default slot and sends it as an instant', async () => {
    const user = userEvent.setup()
    const { onCreate } = setup({ seedDayKey: '2026-08-10' })

    expect(screen.getByLabelText('Date and time (optional)')).toHaveProperty('value', '2026-08-10')
    expect(screen.getByLabelText('Time')).toHaveProperty('value', '09:00')

    await choose(user, 'Platform', 'LinkedIn')
    await user.click(screen.getByRole('button', { name: 'Create post' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate.mock.calls[0]?.[0]).toEqual({
      platform: 'linkedin',
      // The seed is a local day; what goes on the wire is the UTC instant it
      // names, which is only the same string in one timezone.
      scheduledAt: localPartsToIso('2026-08-10', '09:00'),
    })
  })

  it('creates an unscheduled post when the date is cleared', async () => {
    const user = userEvent.setup()
    const { onCreate } = setup({ seedDayKey: '2026-08-10' })

    fireEvent.change(screen.getByLabelText('Date and time (optional)'), { target: { value: '' } })
    await choose(user, 'Platform', 'Instagram')
    await user.click(screen.getByRole('button', { name: 'Create post' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    // `null` stated, not the key omitted — the create schema takes an explicit
    // null so "create unscheduled" is one shape rather than two.
    expect(onCreate.mock.calls[0]?.[0]).toEqual({ platform: 'instagram', scheduledAt: null })
  })

  it('offers no status control before the post exists', () => {
    setup({ seedDayKey: '2026-08-10' })
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull()
  })

  it('refuses copy longer than the wire accepts, without calling the server', async () => {
    const user = userEvent.setup()
    const { onCreate } = setup()

    await choose(user, 'Platform', 'Instagram')
    fireEvent.change(screen.getByLabelText('Copy'), { target: { value: 'a'.repeat(5001) } })
    await user.click(screen.getByRole('button', { name: 'Create post' }))

    expect(await screen.findByText(/Copy is too long/)).toBeTruthy()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('clears a field error as soon as the field is answered', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByText('Choose where this post goes.')).toBeTruthy()

    await choose(user, 'Platform', 'X')
    await waitFor(() => expect(screen.queryByText('Choose where this post goes.')).toBeNull())
  })
})

describe('PostEditorDialog — edit', () => {
  it('re-seeds every field from the post it opens on', () => {
    const existing = post({ status: 'ready', platform: 'tiktok' })
    setup({ post: existing })

    const local = isoToLocalParts(existing.scheduledAt!)
    expect(screen.getByLabelText('Date and time (optional)')).toHaveProperty('value', local.date)
    expect(screen.getByLabelText('Time')).toHaveProperty('value', local.time)
    expect(screen.getByLabelText('Copy')).toHaveProperty('value', existing.body)
    expect(screen.getByRole('combobox', { name: 'Platform' }).textContent).toContain('TikTok')
    expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('Ready')
  })

  it('sends only what changed', async () => {
    const user = userEvent.setup()
    const existing = post()
    const { onUpdate } = setup({ post: existing })

    fireEvent.change(screen.getByLabelText('Copy'), { target: { value: 'New copy' } })
    await user.click(screen.getByRole('button', { name: 'Save post' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    // Not a full row: an untouched `assetIds` would rewrite the join rows, and
    // an untouched `scheduledAt` would look like a reschedule in the cache.
    expect(onUpdate.mock.calls[0]).toEqual([existing.id, { body: 'New copy' }])
  })

  it('patches scheduledAt to null when the date is cleared', async () => {
    const user = userEvent.setup()
    const existing = post()
    const { onUpdate } = setup({ post: existing })

    fireEvent.change(screen.getByLabelText('Date and time (optional)'), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Save post' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0]?.[1]).toEqual({ scheduledAt: null })
  })

  // Not tested here: the `Enter a valid date and time.` branch. A native
  // `type=date` control's value is always either a full `YYYY-MM-DD` or `''` —
  // it sanitises anything else away, in jsdom exactly as in a browser — so a
  // half-typed date arrives as a *cleared* field and unschedules, which is the
  // case above. The guard exists for the browsers that fall back to a text
  // input, and `localPartsToIso`'s refusals are pinned in `calendar.test.ts`.

  it('closes instead of sending an empty patch when nothing changed', async () => {
    const user = userEvent.setup()
    const { onUpdate, onOpenChange } = setup({ post: post() })

    await user.click(screen.getByRole('button', { name: 'Save post' }))

    // `UpdateSocialPostInputSchema` refuses `{}`, so submitting an untouched
    // form would come back a 400 about a request nobody knowingly made.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('carries the status change through', async () => {
    const user = userEvent.setup()
    const { onUpdate } = setup({ post: post() })

    await choose(user, 'Status', 'Posted')
    await user.click(screen.getByRole('button', { name: 'Save post' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0]?.[1]).toEqual({ status: 'posted' })
  })

  it('does not close itself on submit — the page closes it when the write lands', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = setup({ post: post() })

    fireEvent.change(screen.getByLabelText('Copy'), { target: { value: 'New copy' } })
    await user.click(screen.getByRole('button', { name: 'Save post' }))

    // A rejected write has to leave the dialog standing with the copy in it.
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('disables submit while a write is in flight', () => {
    setup({ post: post(), pending: true })
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveProperty('disabled', true)
  })
})

describe('PostEditorDialog — attachments', () => {
  it('attaches from the library in click order and detaches again', async () => {
    const user = userEvent.setup()
    const { onUpdate } = setup({ post: post() })

    await user.click(screen.getByRole('button', { name: 'Add from library' }))
    await user.click(screen.getByRole('button', { name: 'Attach Terrace at dusk' }))
    await user.click(screen.getByRole('button', { name: 'Attach The kitchen' }))
    await user.click(screen.getByRole('button', { name: 'Save post' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    // Order is meaning: it is the display order of the post's images.
    expect(onUpdate.mock.calls[0]?.[1]).toEqual({ assetIds: [terrace.id, kitchen.id] })
  })

  it('drops an attachment from the list without touching anything else', async () => {
    const user = userEvent.setup()
    const { onUpdate } = setup({ post: post({ assetIds: [kitchen.id, terrace.id] }) })

    await user.click(screen.getByRole('button', { name: 'Remove The kitchen' }))
    await user.click(screen.getByRole('button', { name: 'Save post' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0]?.[1]).toEqual({ assetIds: [terrace.id] })
  })

  it('shows an attachment whose asset is gone, rather than hiding a 400', async () => {
    const user = userEvent.setup()
    const ghost = 'a-gone' as BrandAsset['id']
    const { onUpdate } = setup({ post: post({ assetIds: [ghost, kitchen.id] }) })

    // Read-only surfaces skip an unresolved id. This is a write path: kept
    // invisibly in state it would ride along on the next save, and the server
    // refuses a soft-deleted asset with a 400 about an attachment the author
    // cannot see.
    expect(screen.getByText('Unavailable')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Remove unavailable attachment' }))
    await user.click(screen.getByRole('button', { name: 'Save post' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0]?.[1]).toEqual({ assetIds: [kitchen.id] })
  })

  it('offers only images that are not already attached', async () => {
    const user = userEvent.setup()
    setup({ post: post({ assetIds: [kitchen.id] }) })

    await user.click(screen.getByRole('button', { name: 'Add from library' }))
    expect(screen.getByRole('button', { name: 'Attach Terrace at dusk' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Attach The kitchen' })).toBeNull()
  })

  it('appends what an upload lands, and has no Upload control without the prop', async () => {
    const user = userEvent.setup()
    const onUploadFiles = vi.fn().mockResolvedValue([terrace.id])
    const { onUpdate } = setup({ post: post(), onUploadFiles })

    const file = new File(['bytes'], 'terrace.png', { type: 'image/png' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    await waitFor(() => expect(onUploadFiles).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Save post' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0]?.[1]).toEqual({ assetIds: [terrace.id] })
  })

  it('renders no Upload button when the caller cannot upload', () => {
    setup({ post: post() })
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
  })

  it('says so when an upload fails instead of throwing past the dialog', async () => {
    const onUploadFiles = vi.fn().mockRejectedValue(new Error('storage said no'))
    setup({ post: post(), onUploadFiles })

    const file = new File(['bytes'], 'terrace.png', { type: 'image/png' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'That upload did not finish. Nothing was attached.',
    )
  })
})

describe('PostEditorDialog — re-seeding', () => {
  it('picks up the next post when the dialog is reopened on another one', () => {
    const first = post({ body: 'First copy' })
    const second = post({ id: 'p-2' as SocialPost['id'], body: 'Second copy' })
    const { view } = setup({ post: first })
    expect(screen.getByLabelText('Copy')).toHaveProperty('value', 'First copy')

    // Closing unmounts the form; reopening on another post mounts a fresh one.
    // Keying on the id and not the content is what keeps a background refetch
    // from remounting mid-edit and discarding what is being typed.
    view.rerender(
      <PostEditorDialog
        open={false}
        onOpenChange={vi.fn()}
        post={first}
        assets={[kitchen, terrace]}
        resolveBlob={resolve}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
      />,
    )
    view.rerender(
      <PostEditorDialog
        open
        onOpenChange={vi.fn()}
        post={second}
        assets={[kitchen, terrace]}
        resolveBlob={resolve}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Copy')).toHaveProperty('value', 'Second copy')
  })
})
