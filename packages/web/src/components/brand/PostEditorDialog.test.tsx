import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  BrandAsset,
  BrandGuidelineSection,
  BrandWithSections,
  SocialPost,
} from '@brandfactory/shared'
import { PostEditorDialog, type PostEditorDialogProps } from './PostEditorDialog'
import { isoToLocalParts, localPartsToIso } from '@/lib/calendar'
import type { KeyDate } from '@/lib/key-dates'

// The context strip carries a `Link` when a brand's sections are thin. Same
// stub the rail's and the card's tests use — the dialog renders from props
// alone and must not need a router context.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)}
      {...props}
    >
      {children}
    </a>
  ),
}))

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

function asset(id: string, label: string): BrandAsset {
  return {
    id: id as BrandAsset['id'],
    brandId: 'b-1' as BrandAsset['brandId'],
    kind: 'image',
    library: 'photography',
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
    createdBy: 'user',
    assetIds: [],
    deletedAt: null,
    ...STAMPS,
    ...overrides,
  }
}

const resolve = (key: string) => `/blob/${key}`

function guideline(label: string): BrandGuidelineSection {
  return {
    id: `s-${label}` as BrandGuidelineSection['id'],
    brandId: 'b-1' as BrandGuidelineSection['brandId'],
    label,
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Written.' }] }],
    } as BrandGuidelineSection['body'],
    priority: 100,
    createdBy: 'user',
    ...STAMPS,
  }
}

const BRAND: BrandWithSections = {
  id: 'b-1' as BrandWithSections['id'],
  workspaceId: 'w-1' as BrandWithSections['workspaceId'],
  name: 'Casa Vostra',
  description: null,
  websiteUrl: null,
  sections: [guideline('TL;DR'), guideline('Overview')],
  ...STAMPS,
}

const KEY_DATES: KeyDate[] = [
  {
    id: 'sg/national-day',
    set: 'sg-holidays',
    name: 'National Day',
    start: '2026-08-09',
    source: 'test',
  },
  {
    id: 'global/valentines',
    set: 'global',
    name: "Valentine's Day",
    start: '2027-02-14',
    source: 'test',
  },
  {
    id: 'sg/hungry-ghost',
    set: 'sg-holidays',
    name: 'Hungry Ghost Festival',
    start: '2026-08-08',
    end: '2026-09-06',
    source: 'test',
  },
]

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
      // A person typed this into a form — the one authorship claim on this
      // surface that is never in doubt.
      createdBy: 'user',
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
    expect(onCreate.mock.calls[0]?.[0]).toEqual({
      platform: 'instagram',
      scheduledAt: null,
      createdBy: 'user',
    })
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

describe('PostEditorDialog — the context strip', () => {
  it('names the brand and states how much of its context is written', () => {
    setup({ brand: BRAND, seedDayKey: '2026-08-09' })
    expect(screen.getByText('Casa Vostra')).toBeTruthy()
    expect(screen.getByText('Brand context loaded — 2 sections')).toBeTruthy()
  })

  it('shows the key dates on the seeded day, days before seasons', () => {
    setup({ brand: BRAND, keyDates: KEY_DATES, seedDayKey: '2026-08-09' })
    expect(screen.getByText('National Day')).toBeTruthy()
    // 9 August 2026 sits inside the Hungry Ghost month as well.
    expect(screen.getByText('Hungry Ghost Festival')).toBeTruthy()
    // A date in another year is not on this day.
    expect(screen.queryByText("Valentine's Day")).toBeNull()
  })

  it('follows the date field rather than the day it opened on', async () => {
    setup({ brand: BRAND, keyDates: KEY_DATES, seedDayKey: '2026-08-09' })
    expect(screen.getByText('National Day')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Date and time (optional)'), {
      target: { value: '2027-02-14' },
    })

    // The seed said 9 August. The post is now for 14 February, and a chip that
    // kept announcing the seed would be a fact that had stopped being one.
    await waitFor(() => expect(screen.queryByText('National Day')).toBeNull())
    expect(screen.getByText("Valentine's Day")).toBeTruthy()
    expect(screen.queryByText('Hungry Ghost Festival')).toBeNull()
  })

  it('shows no chips at all when the date is cleared', async () => {
    setup({ brand: BRAND, keyDates: KEY_DATES, seedDayKey: '2026-08-09' })
    fireEvent.change(screen.getByLabelText('Date and time (optional)'), { target: { value: '' } })
    await waitFor(() => expect(screen.queryByText('National Day')).toBeNull())
    // Row 1 survives: the brand is a fact about the dialog, not about the day.
    expect(screen.getByText('Casa Vostra')).toBeTruthy()
  })

  it('renders the dialog unchanged with no brand prop', () => {
    setup({ keyDates: KEY_DATES, seedDayKey: '2026-08-09' })
    expect(screen.queryByText('Casa Vostra')).toBeNull()
    expect(screen.queryByText('National Day')).toBeNull()
    expect(screen.queryByText(/Brand context/)).toBeNull()
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

// ---------------------------------------------------------------------------
// Door 3 — the brainstorm column
// ---------------------------------------------------------------------------

const ANGLE = {
  title: 'The pass at service',
  angle: 'Hands in frame, no faces.',
  pillar: null,
  date: '2026-08-10',
  platforms: ['instagram'],
  keyDateName: null,
  reason: 'It is the one thing this kitchen has that nobody else does.',
} as const

/** The dialog with the whole callback set, so the toggle exists. */
function brainstormSetup(
  props: Partial<React.ComponentProps<typeof PostEditorDialog>> = {},
  answers: {
    themes?: Awaited<ReturnType<NonNullable<PostEditorDialogProps['onBrainstorm']>>>
    copy?: string | null
  } = {},
) {
  const onBrainstorm = vi.fn<NonNullable<PostEditorDialogProps['onBrainstorm']>>(async () =>
    answers.themes === undefined
      ? { ideas: [{ ...ANGLE, platforms: [...ANGLE.platforms] }], pillars: [], outcome: 'ok' }
      : answers.themes,
  )
  const onWriteCopy = vi.fn<NonNullable<PostEditorDialogProps['onWriteCopy']>>(async () =>
    answers.copy === undefined ? 'Service starts at six.' : answers.copy,
  )
  const onBrainstormOpenChange = vi.fn()
  const rest = setup({
    seedDayKey: '2026-08-10',
    now: new Date(2026, 7, 10, 9, 0),
    brainstormOpen: true,
    onBrainstormOpenChange,
    onBrainstorm,
    onWriteCopy,
    ...props,
  })
  return { ...rest, onBrainstorm, onWriteCopy, onBrainstormOpenChange }
}

describe('PostEditorDialog — the brainstorm toggle', () => {
  it('is absent without the callbacks, and the dialog is the one Phase A shipped', () => {
    setup({ brand: BRAND, keyDates: KEY_DATES, seedDayKey: '2026-08-09' })
    expect(screen.queryByRole('button', { name: 'Brainstorm' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Brainstorm' })).toBeNull()
    // Everything the dialog had before is still exactly where it was.
    expect(screen.getByText('Casa Vostra')).toBeTruthy()
    expect(screen.getByText('National Day')).toBeTruthy()
    expect(screen.getByLabelText('Copy')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create post' })).toBeTruthy()
  })

  it('renders the column closed by default, and reports the toggle', async () => {
    const user = userEvent.setup()
    const { onBrainstormOpenChange } = brainstormSetup({ brainstormOpen: false })
    expect(screen.queryByRole('region', { name: 'Brainstorm' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Brainstorm' }))
    // The page owns the flag, so a cell can open the dialog with it already on.
    expect(onBrainstormOpenChange).toHaveBeenCalledWith(true)
  })

  it('opens with the column showing when the page says so', () => {
    brainstormSetup()
    expect(screen.getByRole('region', { name: 'Brainstorm' })).toBeTruthy()
    // G3's seed: the day the cell was clicked, in the date field and in the column.
    expect(screen.getByLabelText('Date and time (optional)')).toHaveProperty('value', '2026-08-10')
  })

  it('keeps the context strip above both halves', () => {
    brainstormSetup({ brand: BRAND, keyDates: KEY_DATES })
    // One strip, not one per column — the brand and the day are facts about the
    // whole dialog.
    expect(screen.getAllByText('Casa Vostra')).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Brainstorm' })).toBeTruthy()
  })
})

describe('PostEditorDialog — running a brainstorm', () => {
  it('asks for the day and platform in the form, not for the seed', async () => {
    const user = userEvent.setup()
    const { onBrainstorm } = brainstormSetup()

    await choose(user, 'Platform', 'LinkedIn')
    fireEvent.change(screen.getByLabelText('Date and time (optional)'), {
      target: { value: '2026-08-12' },
    })
    await user.click(screen.getByRole('button', { name: /Three angles/ }))

    await waitFor(() => expect(onBrainstorm).toHaveBeenCalledTimes(1))
    expect(onBrainstorm.mock.calls[0]?.[0]).toEqual({
      dayKey: '2026-08-12',
      platform: 'linkedin',
    })
  })

  it('borrows today when the post has no day of its own', async () => {
    const user = userEvent.setup()
    const { onBrainstorm } = brainstormSetup()

    fireEvent.change(screen.getByLabelText('Date and time (optional)'), { target: { value: '' } })
    await choose(user, 'Platform', 'Instagram')
    await user.click(screen.getByRole('button', { name: /Three angles/ }))

    await waitFor(() => expect(onBrainstorm).toHaveBeenCalledTimes(1))
    expect(onBrainstorm.mock.calls[0]?.[0]?.dayKey).toBe('2026-08-10')
  })

  it('throws the angles away when the question changes', async () => {
    const user = userEvent.setup()
    brainstormSetup()

    await choose(user, 'Platform', 'Instagram')
    await user.click(screen.getByRole('button', { name: /Three angles/ }))
    expect(await screen.findByText('The pass at service')).toBeTruthy()

    // The cards were an answer about 10 August; they are not an answer about
    // the 12th, and leaving them up would be a stale label.
    fireEvent.change(screen.getByLabelText('Date and time (optional)'), {
      target: { value: '2026-08-12' },
    })
    await waitFor(() => expect(screen.queryByText('The pass at service')).toBeNull())
  })

  it('shows the honest line and no cards when nothing comes back', async () => {
    const user = userEvent.setup()
    brainstormSetup({}, { themes: { ideas: [], pillars: [], outcome: 'no-ideas' } })

    await choose(user, 'Platform', 'Instagram')
    await user.click(screen.getByRole('button', { name: /Three angles/ }))

    expect(await screen.findByText(/Nothing came back for this day/)).toBeTruthy()
  })

  it('says nothing extra when the page has already toasted', async () => {
    const user = userEvent.setup()
    brainstormSetup({}, { themes: null })

    await choose(user, 'Platform', 'Instagram')
    await user.click(screen.getByRole('button', { name: /Three angles/ }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Three angles/ })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    expect(screen.queryByText(/Nothing came back/)).toBeNull()
    expect(screen.queryByText(/expected shape/)).toBeNull()
  })
})

describe('PostEditorDialog — using an angle', () => {
  /** Run a brainstorm and pick the one angle it returns. */
  async function pick(user: ReturnType<typeof userEvent.setup>) {
    await choose(user, 'Platform', 'Instagram')
    await user.click(screen.getByRole('button', { name: /Three angles/ }))
    await user.click(await screen.findByRole('button', { name: 'Use The pass at service' }))
  }

  it('fills Copy and leaves it editable', async () => {
    const user = userEvent.setup()
    const { onWriteCopy } = brainstormSetup()
    await pick(user)

    await waitFor(() =>
      expect(screen.getByLabelText('Copy')).toHaveProperty('value', 'Service starts at six.'),
    )
    expect(onWriteCopy.mock.calls[0]?.[1]).toBe('instagram')

    // Still a plain textarea: the caption is a starting point, not a verdict.
    await user.type(screen.getByLabelText('Copy'), ' Sharp.')
    expect(screen.getByLabelText('Copy')).toHaveProperty('value', 'Service starts at six. Sharp.')
  })

  it('creates the post as the agent, and an edit does not take that back', async () => {
    const user = userEvent.setup()
    const { onCreate } = brainstormSetup()
    await pick(user)
    await waitFor(() =>
      expect(screen.getByLabelText('Copy')).toHaveProperty('value', 'Service starts at six.'),
    )

    await user.type(screen.getByLabelText('Copy'), ' Sharp.')
    await user.click(screen.getByRole('button', { name: 'Create post' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    // The same rule D3 states for keeping `createdBy` off the patch schema: an
    // edit does not make you the author of what the agent wrote.
    expect(onCreate.mock.calls[0]?.[0]?.createdBy).toBe('agent')
  })

  it('leaves a post written by hand as the user', async () => {
    const user = userEvent.setup()
    const { onCreate } = brainstormSetup()

    await choose(user, 'Platform', 'Instagram')
    await user.type(screen.getByLabelText('Copy'), 'Mine.')
    await user.click(screen.getByRole('button', { name: 'Create post' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate.mock.calls[0]?.[0]?.createdBy).toBe('user')
  })

  it('offers no undo when there was nothing to replace', async () => {
    const user = userEvent.setup()
    brainstormSetup()
    await pick(user)
    await waitFor(() =>
      expect(screen.getByLabelText('Copy')).toHaveProperty('value', 'Service starts at six.'),
    )
    expect(screen.queryByRole('button', { name: /Put my copy back/ })).toBeNull()
  })

  it('puts back typed copy an angle overwrote, provenance included', async () => {
    const user = userEvent.setup()
    const { onCreate } = brainstormSetup()

    await choose(user, 'Platform', 'Instagram')
    await user.type(screen.getByLabelText('Copy'), 'What I wrote.')
    await user.click(screen.getByRole('button', { name: /Three angles/ }))
    await user.click(await screen.findByRole('button', { name: 'Use The pass at service' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Copy')).toHaveProperty('value', 'Service starts at six.'),
    )

    await user.click(screen.getByRole('button', { name: /Put my copy back/ }))
    expect(screen.getByLabelText('Copy')).toHaveProperty('value', 'What I wrote.')

    await user.click(screen.getByRole('button', { name: 'Create post' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    // The agent's words are no longer the ones being saved.
    expect(onCreate.mock.calls[0]?.[0]?.createdBy).toBe('user')
  })

  it('does not touch Copy when the caption did not arrive', async () => {
    const user = userEvent.setup()
    brainstormSetup({}, { copy: null })

    await choose(user, 'Platform', 'Instagram')
    await user.type(screen.getByLabelText('Copy'), 'What I wrote.')
    await user.click(screen.getByRole('button', { name: /Three angles/ }))
    await user.click(await screen.findByRole('button', { name: 'Use The pass at service' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use The pass at service' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    expect(screen.getByLabelText('Copy')).toHaveProperty('value', 'What I wrote.')
    expect(screen.queryByRole('button', { name: /Put my copy back/ })).toBeNull()
  })
})
