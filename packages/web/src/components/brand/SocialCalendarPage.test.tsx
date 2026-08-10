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
import type * as DownloadModule from '@/lib/download'

// ---------------------------------------------------------------------------
// SocialCalendarPage — the data half
// ---------------------------------------------------------------------------
//
// `AssetLibraryPage.test.tsx`'s shape: the view is **stubbed**, one button
// per callback, so each can be fired with known input. Its own suite covers
// the layout; what is untested otherwise is the callbacks it is handed — the
// dialog's open/seed choreography, which failures toast, the Undo, and the
// upload loop's return value. None of those can be reached through a grid
// jsdom does not lay out.

const mutations = {
  create: vi.fn(),
  createAsync: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  restore: vi.fn(),
  createAssetAsync: vi.fn(),
  ideateThemes: vi.fn(),
  ideateCopy: vi.fn(),
  saveGuidelines: vi.fn(),
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
  useUpdateBrandGuidelines: () => ({
    mutateAsync: mutations.saveGuidelines,
    isPending: false,
  }),
}))

vi.mock('@/api/queries/social-ideas', () => ({
  useIdeateThemes: () => ({ mutateAsync: mutations.ideateThemes, isPending: false }),
  useIdeateCopy: () => ({ mutateAsync: mutations.ideateCopy, isPending: false }),
}))

vi.mock('@/api/queries/blobs', () => ({
  useSignedReadUrls: () => ({ 'k-1': '/signed/k-1', 'k-2': '/signed/k-2' }),
  uploadBlob: vi.fn(async ({ file }: { file: File }) => ({ key: `key-${file.name}` })),
}))

// `downloadUrl` is the browser mechanism and is pinned in its own suite;
// `postDownloads` stays real, because *which files a post hands over* is the
// half of this handler that is worth testing here.
const downloadUrlMock = vi.fn<(url: string, filename: string) => Promise<void>>()
vi.mock('@/lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof DownloadModule>()),
  downloadUrl: (url: string, filename: string) => downloadUrlMock(url, filename),
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
  useCreateSocialPost: () => ({
    mutate: mutations.create,
    mutateAsync: mutations.createAsync,
    isPending: state.createPending,
  }),
  useUpdateSocialPost: () => ({ mutate: mutations.update, isPending: false }),
  useDeleteSocialPost: () => ({ mutate: mutations.del }),
  useRestoreSocialPost: () => ({ mutate: mutations.restore }),
}))

// The planner panel, stubbed the same way: one button per callback, and the
// props whose values are the behaviour — the request the run would send, and
// the rows a commit would write.
vi.mock('@/components/brand/PostPlannerPanel', () => ({
  PostPlannerPanel: (props: {
    ideas: { title: string }[] | null
    selections: { rejected: boolean; platforms: string[] }[]
    planned: number
    cadence: number
    cadenceSource: string
    batch: { slots: number; count: number }
    outcome?: string | null
    onRun: () => void
    onCommit: () => void
    onReset: () => void
    onClose: () => void
    onToggleIdea: (index: number) => void
    onRemovePlatform: (index: number, platform: string) => void
    onSavePillars?: () => void
  }) => (
    <div>
      <span data-testid="planner-ideas">{props.ideas?.length ?? 'none'}</span>
      <span data-testid="planner-outcome">{props.outcome ?? 'none'}</span>
      <span data-testid="planner-cadence">{`${props.cadence}/${props.cadenceSource}`}</span>
      <span data-testid="planner-batch">{`${props.batch.count}/${props.batch.slots}`}</span>
      <span data-testid="planner-chips">
        {props.selections
          .map((s) => (s.rejected ? 'rejected' : s.platforms.join('+') || 'none'))
          .join(',') || 'none'}
      </span>
      <button onClick={props.onRun}>fire plan</button>
      <button onClick={props.onCommit}>fire commit</button>
      <button onClick={props.onReset}>fire reset</button>
      <button onClick={props.onClose}>fire close planner</button>
      <button onClick={() => props.onToggleIdea(0)}>fire reject first</button>
      <button onClick={() => props.onRemovePlatform(0, 'linkedin')}>fire drop linkedin</button>
      <button onClick={() => props.onSavePillars?.()}>fire save pillars</button>
    </div>
  ),
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
    onCopyBody?: (post: SocialPost) => void | Promise<void>
    onDownloadAssets?: (post: SocialPost) => void
    keyDates?: { id: string }[]
    staleSets?: string[]
    enabledSets?: string[]
    onEnabledSetsChange?: (sets: string[]) => void
    planner?: React.ReactNode
    onOpenPlanner?: () => void
    onBrainstormDay?: (dayKey: string) => void
    brainstormOpen?: boolean
    onBrainstormOpenChange?: (open: boolean) => void
    onBrainstorm?: (request: {
      dayKey: string
      platform: string
    }) => Promise<{ outcome: string } | null>
    onWriteCopy?: (idea: unknown, platform: string) => Promise<string | null>
  }) => (
    <div>
      <span data-testid="planner-open">{String(Boolean(props.planner))}</span>
      <span data-testid="brainstorm-open">{String(Boolean(props.brainstormOpen))}</span>
      <button onClick={() => props.onBrainstormDay?.('2026-08-14')}>fire brainstorm day</button>
      <button onClick={() => props.onBrainstormOpenChange?.(false)}>fire close brainstorm</button>
      <button
        onClick={() => {
          void props
            .onBrainstorm?.({ dayKey: '2026-08-14', platform: 'linkedin' })
            .then((result) => {
              brainstormResult.themes = result
            })
        }}
      >
        fire brainstorm
      </button>
      <button
        onClick={() => {
          void props.onWriteCopy?.(BRAINSTORM_IDEA, 'linkedin').then((body) => {
            brainstormResult.copy = body
          })
        }}
      >
        fire write copy
      </button>
      <button onClick={() => props.onOpenPlanner?.()}>fire open planner</button>
      {props.planner}
      <span data-testid="post-count">{props.posts.length}</span>
      <span data-testid="enabled-sets">{(props.enabledSets ?? []).join(',') || 'none'}</span>
      <span data-testid="key-date-count">{props.keyDates?.length ?? 0}</span>
      <span data-testid="stale-sets">{(props.staleSets ?? []).join(',') || 'none'}</span>
      <button onClick={() => props.onEnabledSetsChange?.(['sg-holidays', 'sg-events'])}>
        fire sets change
      </button>
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
      <button
        onClick={() =>
          props.onCreate({ platform: 'instagram', scheduledAt: null, createdBy: 'user' })
        }
      >
        fire create
      </button>
      <button onClick={() => props.onUpdate(POST.id, { body: 'Edited' })}>fire update</button>
      {/* The rejection is swallowed here because the real consumer swallows
          it: `PostDispatchActions` awaits this inside a try/catch and treats a
          refused clipboard as a non-event. A bare `void` would leave an
          unhandled rejection the running app never produces. */}
      <button onClick={() => void Promise.resolve(props.onCopyBody?.(POST)).catch(() => {})}>
        fire copy
      </button>
      <button onClick={() => props.onDownloadAssets?.(POST_WITH_ASSETS)}>fire download</button>
      <button onClick={() => props.onDownloadAssets?.(POST)}>fire download of nothing</button>
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

/** What the two Door 3 calls resolved to, captured out of the stub. */
const brainstormResult: { themes: { outcome: string } | null; copy: string | null } = {
  themes: null,
  copy: null,
}

const BRAINSTORM_IDEA = {
  title: 'The pass at service',
  angle: 'Hands in frame, no faces.',
  pillar: null,
  date: '2026-08-14',
  platforms: ['linkedin'],
  keyDateName: null,
  reason: 'Because it fits.',
}

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
  {
    id: 'a-2',
    brandId: 'b-1',
    kind: 'image',
    source: 'blob',
    role: null,
    status: 'active',
    label: 'Terrace at dusk',
    blobKey: 'k-2',
    filename: 'terrace.png',
    position: 200,
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
  createdBy: 'user',
  assetIds: [],
  deletedAt: null,
  createdAt: T0,
  updatedAt: T0,
} as unknown as SocialPost

/** The same post carrying both images, in the order they were attached. */
const POST_WITH_ASSETS = { ...POST, assetIds: ['a-1', 'a-2'] } as unknown as SocialPost

const APP = { id: 'social', title: 'Social calendar', icon: CalendarDays } as MiniApp

const renderPage = (brandId = 'b-1') => render(<SocialCalendarPage brandId={brandId} app={APP} />)

/** In-memory Storage — `theme.test.ts`'s helper, same reason. */
function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  const ls: Storage = {
    get length() {
      return store.size
    },
    clear: () => {
      store.clear()
    },
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    key: (index) => [...store.keys()][index] ?? null,
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
  Object.defineProperty(window, 'localStorage', { value: ls, configurable: true })
}

/** jsdom has no clipboard; the page's handler is the only thing that uses it. */
const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  vi.clearAllMocks()
  installMemoryLocalStorage()
  writeText.mockResolvedValue(undefined)
  downloadUrlMock.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  state.posts = [POST]
  state.postsPending = false
  state.postsError = false
  state.brandPending = false
  state.brandError = false
  state.createPending = false
  uploadResult.ids = []
  brainstormResult.themes = null
  brainstormResult.copy = null
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

describe('SocialCalendarPage — dispatch', () => {
  it('puts the post’s copy on the clipboard', async () => {
    renderPage()
    fireEvent.click(screen.getByText('fire copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Sunday roast'))
  })

  it('lets a refused clipboard reject rather than reporting a copy that did not happen', async () => {
    writeText.mockRejectedValue(new Error('permission denied'))
    renderPage()

    // The page does not catch it: `PostDispatchActions` is where a refusal is
    // judged a non-event, and swallowing it here would turn every refusal into
    // a `Copied` that never happened.
    fireEvent.click(screen.getByText('fire copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(toastError).not.toHaveBeenCalled()
  })

  it('downloads every resolvable attachment, one after another, in order', async () => {
    const order: string[] = []
    downloadUrlMock.mockImplementation(async (_url, filename) => {
      order.push(`start ${filename}`)
      await Promise.resolve()
      order.push(`end ${filename}`)
    })
    renderPage()
    fireEvent.click(screen.getByText('fire download'))

    await waitFor(() => expect(downloadUrlMock).toHaveBeenCalledTimes(2))
    // Sequential, not `Promise.all`: a browser silently drops a burst of
    // parallel programmatic downloads, and a partial failure has to be able to
    // name the file that did not arrive.
    expect(order).toEqual([
      'start The kitchen',
      'end The kitchen',
      'start terrace.png',
      'end terrace.png',
    ])
    // The signed URL, and the uploaded filename where one was recorded.
    expect(downloadUrlMock.mock.calls[0]).toEqual(['/signed/k-1', 'The kitchen'])
    expect(downloadUrlMock.mock.calls[1]).toEqual(['/signed/k-2', 'terrace.png'])
  })

  it('toasts the file that failed and keeps going', async () => {
    downloadUrlMock.mockRejectedValueOnce(new Error('storage said no')).mockResolvedValue(undefined)
    renderPage()
    fireEvent.click(screen.getByText('fire download'))

    await waitFor(() => expect(downloadUrlMock).toHaveBeenCalledTimes(2))
    // Named, because a loop is what makes naming it possible. The file that
    // landed is a real file on the user's disk and is worth keeping.
    expect(toastError).toHaveBeenCalledWith('Could not download The kitchen')
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all for a post with no resolvable attachment', async () => {
    renderPage()
    fireEvent.click(screen.getByText('fire download of nothing'))

    await waitFor(() => expect(writeText).not.toHaveBeenCalled())
    expect(downloadUrlMock).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
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

describe('SocialCalendarPage — key dates', () => {
  it('opens a brand nobody has touched on the default set', () => {
    renderPage()
    expect(screen.getByTestId('enabled-sets').textContent).toBe('global')
    // And the default set actually resolves to dates, rather than a lit menu
    // over an empty calendar.
    expect(Number(screen.getByTestId('key-date-count').textContent)).toBeGreaterThan(0)
  })

  it('writes a toggle through to storage under the brand’s own key', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire sets change'))

    expect(screen.getByTestId('enabled-sets').textContent).toBe('sg-holidays,sg-events')
    expect(localStorage.getItem('bf_key_dates_b-1')).toBe('sg-holidays,sg-events')
  })

  it('re-reads the sets when the brand changes', () => {
    // D8, and the reason a bare `useState(() => getEnabledSets(brandId))` is
    // wrong: it initialises once, so the second brand would inherit the first
    // brand's sets *and* write them back under its own key — which is how a
    // per-brand preference quietly becomes a global one.
    localStorage.setItem('bf_key_dates_b-1', 'sg-events')
    localStorage.setItem('bf_key_dates_b-2', 'sg-holidays')

    const { rerender } = renderPage('b-1')
    expect(screen.getByTestId('enabled-sets').textContent).toBe('sg-events')

    rerender(<SocialCalendarPage brandId="b-2" app={APP} />)
    expect(screen.getByTestId('enabled-sets').textContent).toBe('sg-holidays')
  })

  it('keeps a brand that switched everything off switched off', () => {
    localStorage.setItem('bf_key_dates_b-1', '')
    renderPage()
    expect(screen.getByTestId('enabled-sets').textContent).toBe('none')
    expect(screen.getByTestId('key-date-count').textContent).toBe('0')
  })

  it('reports a stale set against the month the cursor is on, not against today', () => {
    localStorage.setItem('bf_key_dates_b-1', 'sg-events')
    renderPage()
    // The cursor opens on the current month, which the events set still covers.
    expect(screen.getByTestId('stale-sets').textContent).toBe('none')

    // Walk forward far enough to outrun the events horizon (2026-12-31).
    for (let i = 0; i < 14; i++) fireEvent.click(screen.getByText('fire next'))
    expect(screen.getByTestId('stale-sets').textContent).toBe('sg-events')
  })
})

// ---------------------------------------------------------------------------
// The planner — the two rules, and what a commit writes
// ---------------------------------------------------------------------------
//
// The panel is stubbed, so what is under test here is `usePostPlanner`: the
// request it builds, the rows a commit writes, and the two rules F7 states —
// **every commit is an insert**, and a rejected card contributes nothing.

/** One idea, dated or not, on the platforms given. */
function idea(title: string, date: string | null, platforms: string[]) {
  return {
    title,
    angle: `Angle for ${title}`,
    pillar: 'The room',
    date,
    platforms,
    keyDateName: null,
    reason: 'Because it fits.',
  }
}

function themesOk(ideas: ReturnType<typeof idea>[], proposed = false) {
  return {
    ideas,
    pillars: [{ name: 'The room', proposed }],
    outcome: 'ok',
  }
}

/** Open the planner and run pass 1. */
async function plan() {
  fireEvent.click(screen.getByText('fire open planner'))
  await act(async () => {
    fireEvent.click(screen.getByText('fire plan'))
  })
}

describe('SocialCalendarPage — the planner', () => {
  beforeEach(() => {
    mutations.ideateCopy.mockResolvedValue({
      copies: [
        { index: 0, body: 'First caption', mediaDirection: '' },
        { index: 1, body: 'Second caption', mediaDirection: '' },
      ],
      outcome: 'ok',
    })
    mutations.createAsync.mockResolvedValue(POST)
  })

  it('is closed until it is opened, and closes again', () => {
    renderPage()
    expect(screen.getByTestId('planner-open').textContent).toBe('false')
    fireEvent.click(screen.getByText('fire open planner'))
    expect(screen.getByTestId('planner-open').textContent).toBe('true')
    fireEvent.click(screen.getByText('fire close planner'))
    expect(screen.getByTestId('planner-open').textContent).toBe('false')
  })

  it('quotes the taken day+platform pairs inside the window, and only those', async () => {
    // Built from the clock rather than hardcoded, because the `This month`
    // window starts *today* when today is inside the month on screen. The last
    // day of the current month is inside that window on every day of the month;
    // a fixed date would fall out of it as soon as the month advanced past it.
    // Midday local, so the UTC instant lands on the same local day everywhere.
    const now = new Date()
    const inWindow = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0)
    const dayKey = [
      inWindow.getFullYear(),
      String(inWindow.getMonth() + 1).padStart(2, '0'),
      String(inWindow.getDate()).padStart(2, '0'),
    ].join('-')
    // A year back — outside the window under any clock, and the pair that an
    // unfiltered `takenSlots` would have quoted alongside the useful one.
    const longPast = new Date(now.getFullYear() - 1, now.getMonth(), 15, 12, 0)

    state.posts = [
      { ...POST, id: 'p-old', scheduledAt: longPast.toISOString() } as unknown as SocialPost,
      { ...POST, id: 'p-new', scheduledAt: inWindow.toISOString() } as unknown as SocialPost,
    ]

    mutations.ideateThemes.mockResolvedValue(themesOk([idea('A', null, ['instagram'])]))
    renderPage()
    await plan()

    const input = mutations.ideateThemes.mock.calls[0]?.[0] as {
      taken: { day: string; platform: string }[]
      platforms: string[]
      count: number
    }
    // Only the in-window pair. The out-of-window one cannot collide with any
    // idea this run may return, and quoting it spends a slot in a list that has
    // a ceiling — the truncation that used to drop the pairs that mattered.
    expect(input.taken).toEqual([{ day: dayKey, platform: 'instagram' }])
    // The platforms open on what the brand actually posts to.
    expect(input.platforms).toEqual(['instagram'])
    expect(input.count).toBeGreaterThan(0)
  })

  it('keeps the brief standing on an honest empty answer', async () => {
    mutations.ideateThemes.mockResolvedValue({ ideas: [], pillars: [], outcome: 'no-ideas' })
    renderPage()
    await plan()

    expect(screen.getByTestId('planner-ideas').textContent).toBe('none')
    expect(screen.getByTestId('planner-outcome').textContent).toBe('no-ideas')
  })

  it('writes one row per chip, as an insert, and never an update', async () => {
    mutations.ideateThemes.mockResolvedValue(
      themesOk([idea('A', '2026-08-11', ['instagram', 'linkedin'])]),
    )
    renderPage()
    await plan()
    expect(screen.getByTestId('planner-chips').textContent).toBe('instagram+linkedin')

    await act(async () => {
      fireEvent.click(screen.getByText('fire commit'))
    })

    // Two chips on one card is two rows (Q8).
    expect(mutations.createAsync).toHaveBeenCalledTimes(2)
    expect(mutations.update).not.toHaveBeenCalled()
    const first = mutations.createAsync.mock.calls[0]?.[0] as CreateSocialPostInput
    expect(first.platform).toBe('instagram')
    expect(first.createdBy).toBe('agent')
    expect(first.status).toBe('draft')
    expect(first.body).toBe('First caption')
    // 09:00 local on the idea's day — `DEFAULT_POST_TIME`, through the one
    // converter.
    expect(first.scheduledAt).toBe(new Date(2026, 7, 11, 9, 0, 0, 0).toISOString())
  })

  it('commits a dateless idea unscheduled', async () => {
    mutations.ideateThemes.mockResolvedValue(themesOk([idea('A', null, ['instagram'])]))
    renderPage()
    await plan()
    await act(async () => {
      fireEvent.click(screen.getByText('fire commit'))
    })

    const input = mutations.createAsync.mock.calls[0]?.[0] as CreateSocialPostInput
    expect(input.scheduledAt).toBeNull()
  })

  it('writes nothing for a rejected card, and one row fewer for a dropped chip', async () => {
    mutations.ideateThemes.mockResolvedValue(
      themesOk([
        idea('A', '2026-08-11', ['instagram', 'linkedin']),
        idea('B', '2026-08-12', ['instagram']),
      ]),
    )
    renderPage()
    await plan()

    fireEvent.click(screen.getByText('fire drop linkedin'))
    expect(screen.getByTestId('planner-chips').textContent).toBe('instagram,instagram')
    await act(async () => {
      fireEvent.click(screen.getByText('fire commit'))
    })
    expect(mutations.createAsync).toHaveBeenCalledTimes(2)

    mutations.createAsync.mockClear()
    await plan()
    fireEvent.click(screen.getByText('fire reject first'))
    expect(screen.getByTestId('planner-chips').textContent).toBe('rejected,instagram')
    await act(async () => {
      fireEvent.click(screen.getByText('fire commit'))
    })
    expect(mutations.createAsync).toHaveBeenCalledTimes(1)
  })

  it('keeps writing after a failed row, and reports the partial count', async () => {
    mutations.ideateThemes.mockResolvedValue(
      themesOk([idea('A', '2026-08-11', ['instagram']), idea('B', '2026-08-12', ['instagram'])]),
    )
    mutations.createAsync.mockRejectedValueOnce(new Error('nope')).mockResolvedValue(POST)
    renderPage()
    await plan()
    await act(async () => {
      fireEvent.click(screen.getByText('fire commit'))
    })

    expect(mutations.createAsync).toHaveBeenCalledTimes(2)
    expect(toastError).toHaveBeenCalled()
    expect(toastFn).toHaveBeenCalledWith('Created 1 of 2 posts')
  })

  it('commits the slots when the copy pass fails, rather than losing the decision', async () => {
    mutations.ideateThemes.mockResolvedValue(themesOk([idea('A', '2026-08-11', ['instagram'])]))
    mutations.ideateCopy.mockRejectedValue(new Error('model down'))
    renderPage()
    await plan()
    await act(async () => {
      fireEvent.click(screen.getByText('fire commit'))
    })

    const input = mutations.createAsync.mock.calls[0]?.[0] as CreateSocialPostInput
    // `''` is *slot claimed, copy pending* — the user agreed to the post.
    expect(input.body).toBe('')
    expect(toastFn).toHaveBeenCalledWith('1 post has no copy yet — write it in the editor.')
  })

  it('saves proposed pillars into the brand only when asked', async () => {
    mutations.ideateThemes.mockResolvedValue(
      themesOk([idea('A', '2026-08-11', ['instagram'])], true),
    )
    mutations.saveGuidelines.mockResolvedValue([])
    renderPage()
    await plan()
    expect(mutations.saveGuidelines).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByText('fire save pillars'))
    })
    const payload = mutations.saveGuidelines.mock.calls[0]?.[0] as {
      sections: { label: string; createdBy: string }[]
    }
    // The brand has no sections, so the write appends one — authored by the
    // agent, because the agent is who wrote it.
    expect(payload.sections).toHaveLength(1)
    expect(payload.sections[0]?.label).toBe('Content pillars')
    expect(payload.sections[0]?.createdBy).toBe('agent')
  })

  it('throws the run away when the window changes under it', async () => {
    mutations.ideateThemes.mockResolvedValue(themesOk([idea('A', '2026-08-11', ['instagram'])]))
    renderPage()
    await plan()
    expect(screen.getByTestId('planner-ideas').textContent).toBe('1')

    fireEvent.click(screen.getByText('fire reset'))
    expect(screen.getByTestId('planner-ideas').textContent).toBe('none')
  })
})

describe('SocialCalendarPage — Door 3', () => {
  it('opens the dialog on the day with the column already showing', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire brainstorm day'))

    expect(screen.getByTestId('dialog-open').textContent).toBe('true')
    expect(screen.getByTestId('seed').textContent).toBe('2026-08-14')
    expect(screen.getByTestId('editing').textContent).toBe('none')
    expect(screen.getByTestId('brainstorm-open').textContent).toBe('true')
  })

  it('leaves the column off for every other way into the dialog', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire brainstorm day'))
    expect(screen.getByTestId('brainstorm-open').textContent).toBe('true')

    // The toggle is a decision about one dialog, not a preference that follows
    // the user around.
    fireEvent.click(screen.getByText('fire new from header'))
    expect(screen.getByTestId('brainstorm-open').textContent).toBe('false')

    fireEvent.click(screen.getByText('fire brainstorm day'))
    fireEvent.click(screen.getByText('fire edit'))
    expect(screen.getByTestId('brainstorm-open').textContent).toBe('false')
  })

  it('sends a one-day window, one platform, three ideas and no taken slots', async () => {
    mutations.ideateThemes.mockResolvedValue({ ideas: [], pillars: [], outcome: 'no-ideas' })
    renderPage()
    await act(async () => {
      fireEvent.click(screen.getByText('fire brainstorm'))
    })

    const input = mutations.ideateThemes.mock.calls[0]?.[0] as {
      window: { start: string; end: string }
      platforms: string[]
      taken: unknown[]
      count: number
    }
    expect(input.window).toEqual({ start: '2026-08-14', end: '2026-08-14' })
    expect(input.platforms).toEqual(['linkedin'])
    expect(input.count).toBe(3)
    // The one place the planner's rule does not apply: the user named this day.
    expect(input.taken).toEqual([])
  })

  it('hands the outcome back rather than swallowing it', async () => {
    mutations.ideateThemes.mockResolvedValue({ ideas: [], pillars: [], outcome: 'no-ideas' })
    renderPage()
    await act(async () => {
      fireEvent.click(screen.getByText('fire brainstorm'))
    })
    expect(brainstormResult.themes?.outcome).toBe('no-ideas')
    expect(toastError).not.toHaveBeenCalled()
  })

  it('toasts a failed run and answers null', async () => {
    mutations.ideateThemes.mockRejectedValue(new Error('model down'))
    renderPage()
    await act(async () => {
      fireEvent.click(screen.getByText('fire brainstorm'))
    })
    expect(brainstormResult.themes).toBeNull()
    expect(toastError).toHaveBeenCalledWith('Could not brainstorm this day')
  })

  it('writes the copy for one angle', async () => {
    mutations.ideateCopy.mockResolvedValue({
      copies: [{ index: 0, body: 'Service starts at six.', mediaDirection: '' }],
      outcome: 'ok',
    })
    renderPage()
    await act(async () => {
      fireEvent.click(screen.getByText('fire write copy'))
    })

    expect(mutations.ideateCopy.mock.calls[0]?.[0]).toEqual({
      items: [{ idea: BRAINSTORM_IDEA, platform: 'linkedin' }],
    })
    expect(brainstormResult.copy).toBe('Service starts at six.')
    // Nothing is written: the caption lands in a field the user still submits.
    expect(mutations.create).not.toHaveBeenCalled()
    expect(mutations.createAsync).not.toHaveBeenCalled()
  })

  it('refuses a blank caption rather than emptying the field', async () => {
    // Unlike the planner, where `''` is *slot claimed, copy pending* on a row
    // the user agreed to. Here there is no row, so an empty body would be the
    // whole visible result of pressing the button.
    mutations.ideateCopy.mockResolvedValue({
      copies: [{ index: 0, body: '   ', mediaDirection: '' }],
      outcome: 'ok',
    })
    renderPage()
    await act(async () => {
      fireEvent.click(screen.getByText('fire write copy'))
    })
    expect(brainstormResult.copy).toBeNull()
    expect(toastError).toHaveBeenCalledWith('The model wrote nothing for that angle')
  })

  it('toasts a failed copy pass and answers null', async () => {
    mutations.ideateCopy.mockRejectedValue(new Error('model down'))
    renderPage()
    await act(async () => {
      fireEvent.click(screen.getByText('fire write copy'))
    })
    expect(brainstormResult.copy).toBeNull()
    expect(toastError).toHaveBeenCalledWith('Could not write the copy for that angle')
  })
})
