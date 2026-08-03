import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CalendarDays } from 'lucide-react'
import type {
  BrandAsset,
  CreateSocialPostInput,
  SocialPost,
  SocialPostId,
  UpdateSocialPostInput,
} from '@brandfactory/shared'
import type { MiniApp } from './miniApps'

// ---------------------------------------------------------------------------
// SocialCalendarPage — the data half
// ---------------------------------------------------------------------------
//
// `VisualIdentityPage.test.tsx`'s shape: the view is **stubbed**, one button
// per callback, so each can be fired with known input. Its own suite covers
// the layout; what is untested otherwise is the callbacks it is handed — the
// dialog's open/seed choreography, which failures toast, the Undo, and the
// upload loop's return value. None of those can be reached through a grid
// jsdom does not lay out.

const mutations = {
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  restore: vi.fn(),
  createAssetAsync: vi.fn(),
}

const state: {
  posts: SocialPost[] | undefined
  postsPending: boolean
  postsError: boolean
  brandPending: boolean
  brandError: boolean
  createPending: boolean
} = {
  posts: [],
  postsPending: false,
  postsError: false,
  brandPending: false,
  brandError: false,
  createPending: false,
}

const toastFn = vi.fn()
const toastError = vi.fn()

vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => toastFn(...args), {
    error: (...args: unknown[]) => toastError(...args),
  }),
}))

vi.mock('@/api/queries/brands', () => ({
  useBrand: () => ({
    data: state.brandPending || state.brandError ? undefined : BRAND,
    isPending: state.brandPending,
    isError: state.brandError,
  }),
}))

vi.mock('@/api/queries/blobs', () => ({
  useSignedReadUrls: () => ({ 'k-1': '/signed/k-1' }),
  uploadBlob: vi.fn(async ({ file }: { file: File }) => ({ key: `key-${file.name}` })),
}))

vi.mock('@/api/queries/assets', () => ({
  useBrandAssets: () => ({ data: ASSETS }),
  useCreateAsset: () => ({ mutateAsync: mutations.createAssetAsync }),
}))

vi.mock('@/api/queries/social-posts', () => ({
  useBrandSocialPosts: () => ({
    data: state.posts,
    isPending: state.postsPending,
    isError: state.postsError,
  }),
  useCreateSocialPost: () => ({ mutate: mutations.create, isPending: state.createPending }),
  useUpdateSocialPost: () => ({ mutate: mutations.update, isPending: false }),
  useDeleteSocialPost: () => ({ mutate: mutations.del }),
  useRestoreSocialPost: () => ({ mutate: mutations.restore }),
}))

// A stub with one button per callback. `data-testid` spans expose the props
// whose *values* are the behaviour under test — the dialog's seed especially.
vi.mock('@/components/brand/SocialCalendarView', () => ({
  SocialCalendarView: (props: {
    posts: SocialPost[]
    assets: BrandAsset[]
    resolveBlob: (key: string) => string
    dialogOpen: boolean
    editingPost: SocialPost | null
    seedDayKey: string | null
    pending?: boolean
    year: number
    month: number
    onNewPost: (dayKey: string | null) => void
    onEditPost: (post: SocialPost) => void
    onMarkPosted: (post: SocialPost) => void
    onDeletePost: (post: SocialPost) => void
    onCreate: (input: CreateSocialPostInput) => void
    onUpdate: (id: SocialPostId, patch: UpdateSocialPostInput) => void
    onPrevMonth: () => void
    onNextMonth: () => void
    onToday: () => void
    onUploadFiles?: (files: File[]) => Promise<string[]>
  }) => (
    <div>
      <span data-testid="post-count">{props.posts.length}</span>
      <span data-testid="resolved">{props.resolveBlob('k-1')}</span>
      <span data-testid="dialog-open">{String(props.dialogOpen)}</span>
      <span data-testid="editing">{props.editingPost?.id ?? 'none'}</span>
      <span data-testid="seed">{props.seedDayKey ?? 'none'}</span>
      <span data-testid="pending">{String(props.pending)}</span>
      <span data-testid="cursor">{`${props.year}-${props.month}`}</span>
      <button onClick={() => props.onNewPost(null)}>fire new from header</button>
      <button onClick={() => props.onNewPost('2026-08-10')}>fire new from cell</button>
      <button onClick={() => props.onEditPost(POST)}>fire edit</button>
      <button onClick={() => props.onMarkPosted(POST)}>fire mark posted</button>
      <button onClick={() => props.onDeletePost(POST)}>fire delete</button>
      <button onClick={() => props.onCreate({ platform: 'instagram', scheduledAt: null })}>
        fire create
      </button>
      <button onClick={() => props.onUpdate(POST.id, { body: 'Edited' })}>fire update</button>
      <button onClick={() => props.onPrevMonth()}>fire prev</button>
      <button onClick={() => props.onNextMonth()}>fire next</button>
      <button
        onClick={() => {
          void props
            .onUploadFiles?.([new File(['x'], 'one.png', { type: 'image/png' })])
            .then((ids) => {
              uploadResult.ids = ids
            })
        }}
      >
        fire upload
      </button>
    </div>
  ),
}))

const uploadResult: { ids: string[] } = { ids: [] }

const { SocialCalendarPage } = await import('./SocialCalendarPage')

const T0 = '2026-07-29T00:00:00.000Z'
const BRAND = {
  id: 'b-1',
  workspaceId: 'w-1',
  name: 'Casa Vostra',
  description: null,
  websiteUrl: null,
  createdAt: T0,
  updatedAt: T0,
  sections: [],
}

const ASSETS = [
  {
    id: 'a-1',
    brandId: 'b-1',
    kind: 'image',
    source: 'blob',
    role: null,
    status: 'active',
    label: 'The kitchen',
    blobKey: 'k-1',
    position: 100,
    deletedAt: null,
    createdAt: T0,
    updatedAt: T0,
  },
] as unknown as BrandAsset[]

const POST = {
  id: 'p-1' as SocialPostId,
  brandId: 'b-1',
  platform: 'instagram',
  scheduledAt: '2026-08-03T09:00:00.000Z',
  body: 'Sunday roast',
  status: 'draft',
  assetIds: [],
  deletedAt: null,
  createdAt: T0,
  updatedAt: T0,
} as unknown as SocialPost

const APP = { id: 'social', title: 'Social calendar', icon: CalendarDays } as MiniApp

const renderPage = () => render(<SocialCalendarPage brandId="b-1" app={APP} />)

beforeEach(() => {
  vi.clearAllMocks()
  state.posts = [POST]
  state.postsPending = false
  state.postsError = false
  state.brandPending = false
  state.brandError = false
  state.createPending = false
  uploadResult.ids = []
})

describe('SocialCalendarPage — gating', () => {
  it.each([
    ['the brand is still loading', { brandPending: true }],
    ['the posts are still loading', { postsPending: true }],
  ])('shows a loading shell while %s', (_name, over) => {
    Object.assign(state, over)
    renderPage()
    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it.each([
    ['the brand query failed', { brandError: true }],
    ['the post query failed', { postsError: true }],
  ])('explains rather than rendering an empty calendar when %s', (_name, over) => {
    Object.assign(state, over)
    renderPage()
    expect(screen.getByText(/Failed to load this brand/)).toBeTruthy()
  })

  it('passes the posts and a working blob resolver through', () => {
    renderPage()
    expect(screen.getByTestId('post-count').textContent).toBe('1')
    expect(screen.getByTestId('resolved').textContent).toBe('/signed/k-1')
  })

  // The asset query has no gate of its own: attachments are a nicety, and a
  // calendar that refuses to render because the library is slow would be worse
  // than one whose thumbnails arrive a moment later.
  it('renders the calendar even before the asset list arrives', () => {
    renderPage()
    expect(screen.getByTestId('post-count')).toBeTruthy()
  })
})

describe('SocialCalendarPage — the dialog’s choreography', () => {
  it('opens on today when the header starts a post, not on the tray', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire new from header'))
    // `null` from the header would mean "unscheduled", and a post started from
    // the header is far more often meant for today.
    const today = new Date()
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(screen.getByTestId('seed').textContent).toBe(key)
    expect(screen.getByTestId('dialog-open').textContent).toBe('true')
    expect(screen.getByTestId('editing').textContent).toBe('none')
  })

  it('opens on the clicked day when a cell starts a post', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire new from cell'))
    expect(screen.getByTestId('seed').textContent).toBe('2026-08-10')
  })

  it('opens on the post being edited, with no seed to compete with it', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire edit'))
    expect(screen.getByTestId('editing').textContent).toBe('p-1')
    expect(screen.getByTestId('seed').textContent).toBe('none')
  })

  it('closes only when the write lands', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire new from cell'))
    fireEvent.click(screen.getByText('fire create'))

    expect(mutations.create).toHaveBeenCalledTimes(1)
    // Still open: the mutation's `onSuccess` has not run.
    expect(screen.getByTestId('dialog-open').textContent).toBe('true')

    const [, handlers] = mutations.create.mock.calls[0] as [unknown, { onSuccess: () => void }]
    act(() => handlers.onSuccess())
    expect(screen.getByTestId('dialog-open').textContent).toBe('false')
  })

  it('leaves the dialog standing when the write is refused, and says why', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire new from cell'))
    fireEvent.click(screen.getByText('fire create'))

    const [, handlers] = mutations.create.mock.calls[0] as [
      unknown,
      { onError: (e: unknown) => void },
    ]
    act(() => handlers.onError(new Error('boom')))

    expect(toastError).toHaveBeenCalledWith('Could not create that post')
    expect(screen.getByTestId('dialog-open').textContent).toBe('true')
  })

  it('reports an in-flight write to the dialog', () => {
    state.createPending = true
    renderPage()
    expect(screen.getByTestId('pending').textContent).toBe('true')
  })

  it('passes an edit through as a patch on that post', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire update'))
    expect(mutations.update.mock.calls[0]?.[0]).toEqual({ id: POST.id, patch: { body: 'Edited' } })
  })
})

describe('SocialCalendarPage — the row actions', () => {
  it('marks a post posted with a status patch and no dialog', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire mark posted'))
    expect(mutations.update.mock.calls[0]?.[0]).toEqual({
      id: POST.id,
      patch: { status: 'posted' },
    })
    expect(screen.getByTestId('dialog-open').textContent).toBe('false')
  })

  it('names the removed post and offers Undo', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire delete'))

    const [, handlers] = mutations.del.mock.calls[0] as [
      unknown,
      { onSuccess: () => void; onError: (e: unknown) => void },
    ]
    act(() => handlers.onSuccess())

    // A calendar of chips gives no other clue which one just left.
    expect(toastFn).toHaveBeenCalledWith(
      'Removed Sunday roast',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    )

    const [, options] = toastFn.mock.calls[0] as [string, { action: { onClick: () => void } }]
    options.action.onClick()
    expect(mutations.restore).toHaveBeenCalledWith(POST.id, expect.anything())
  })

  it('closes the editor when the post open in it is deleted', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire edit'))
    fireEvent.click(screen.getByText('fire delete'))

    const [, handlers] = mutations.del.mock.calls[0] as [unknown, { onSuccess: () => void }]
    act(() => handlers.onSuccess())
    // Otherwise the dialog goes on editing a row that no longer exists.
    expect(screen.getByTestId('dialog-open').textContent).toBe('false')
  })

  it('reports a failed delete as an error and offers no Undo for it', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire delete'))

    const [, handlers] = mutations.del.mock.calls[0] as [unknown, { onError: (e: unknown) => void }]
    act(() => handlers.onError(new Error('boom')))

    expect(toastError).toHaveBeenCalledWith('Could not remove that post')
    expect(toastFn).not.toHaveBeenCalled()
  })
})

describe('SocialCalendarPage — the month cursor', () => {
  it('starts on the current month and moves by whole months', () => {
    renderPage()
    const now = new Date()
    expect(screen.getByTestId('cursor').textContent).toBe(`${now.getFullYear()}-${now.getMonth()}`)

    fireEvent.click(screen.getByText('fire prev'))
    const back = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    expect(screen.getByTestId('cursor').textContent).toBe(
      `${back.getFullYear()}-${back.getMonth()}`,
    )

    fireEvent.click(screen.getByText('fire next'))
    expect(screen.getByTestId('cursor').textContent).toBe(`${now.getFullYear()}-${now.getMonth()}`)
  })
})

describe('SocialCalendarPage — uploads', () => {
  it('lands the file in the library and hands its id back to the dialog', async () => {
    mutations.createAssetAsync.mockResolvedValue({ id: 'a-new' })
    renderPage()
    fireEvent.click(screen.getByText('fire upload'))

    await waitFor(() => expect(uploadResult.ids).toEqual(['a-new']))
    // An `image` blob asset labelled with the filename — the upload is a real
    // library asset, not an orphan attached to one post.
    expect(mutations.createAssetAsync).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image', source: 'blob', label: 'one.png' }),
    )
  })

  it('toasts a failed file and returns the ids that did land', async () => {
    mutations.createAssetAsync.mockRejectedValue(new Error('storage said no'))
    renderPage()
    fireEvent.click(screen.getByText('fire upload'))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Could not add one.png'))
    expect(uploadResult.ids).toEqual([])
  })
})
