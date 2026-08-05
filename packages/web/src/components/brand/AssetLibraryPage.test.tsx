import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  AssetLibrary,
  BrandAsset,
  BrandAssetId,
  UpdateBrandAssetInput,
} from '@brandfactory/shared'

// ---------------------------------------------------------------------------
// AssetLibraryPage — the half that had no tests
// ---------------------------------------------------------------------------
//
// The Stage 1–2 review's fifth finding. `AssetLibraryView` shipped 2E with 24
// tests and its data half with none, and the data half is where the logic is:
// the sequential upload loop, the reorder arithmetic, which failures become a
// toast and which become inline text, and — since this pass — the Undo.
//
// `AssetLibraryView` is stubbed rather than rendered. Its own suite covers the
// layout thoroughly; what is untested is the *callbacks it is handed*, and a
// stub that exposes one button per callback tests those directly instead of
// through a drag gesture jsdom cannot perform. That is also the seam the pure
// view was built for — this file is the second consumer that proves it.

const mutations = {
  create: vi.fn(),
  createAsync: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  restore: vi.fn(),
  reorder: vi.fn(),
}

const state: {
  assets: BrandAsset[] | undefined
  assetsPending: boolean
  assetsError: boolean
  brandPending: boolean
  brandError: boolean
} = {
  assets: [],
  assetsPending: false,
  assetsError: false,
  brandPending: false,
  brandError: false,
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
  useBrandAssets: () => ({
    data: state.assets,
    isPending: state.assetsPending,
    isError: state.assetsError,
  }),
  useCreateAsset: () => ({ mutate: mutations.create, mutateAsync: mutations.createAsync }),
  useUpdateAsset: () => ({ mutate: mutations.update }),
  useDeleteAsset: () => ({ mutate: mutations.del }),
  useRestoreAsset: () => ({ mutate: mutations.restore }),
  useReorderAssets: () => ({ mutate: mutations.reorder }),
}))

// A stub with one button per callback, so each can be fired with known input.
vi.mock('@/components/brand/AssetLibraryView', () => ({
  AssetLibraryView: (props: {
    assets: BrandAsset[]
    resolveBlob: (key: string) => string
    onDeleteAsset?: (id: BrandAssetId) => void
    onUpdateAsset?: (id: BrandAssetId, patch: UpdateBrandAssetInput) => void
    onReorderColors?: (ids: BrandAssetId[]) => void
    onAddColor?: (input: { label: string; value: string }) => void
  }) => (
    <div>
      <span data-testid="asset-count">{props.assets.length}</span>
      <span data-testid="resolved">{props.resolveBlob('k-1')}</span>
      <button onClick={() => props.onDeleteAsset?.('a-1' as BrandAssetId)}>fire delete</button>
      <button onClick={() => props.onUpdateAsset?.('a-1' as BrandAssetId, { label: 'Rust' })}>
        fire update
      </button>
      <button onClick={() => props.onAddColor?.({ label: 'Olive', value: '#5d6b42' })}>
        fire add colour
      </button>
      <span data-testid="has-add-colour">{props.onAddColor ? 'yes' : 'no'}</span>
      <button
        onClick={() => props.onUpdateAsset?.('a-1' as BrandAssetId, { library: 'collateral' })}
      >
        fire move
      </button>
      <button
        onClick={() => props.onReorderColors?.(['a-3', 'a-1', 'a-2'] as unknown as BrandAssetId[])}
      >
        fire reorder
      </button>
    </div>
  ),
}))

const { AssetLibraryPage } = await import('./AssetLibraryPage')

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

function color(
  id: string,
  label: string,
  position: number,
  library: AssetLibrary = 'identity',
): BrandAsset {
  return {
    id: id as BrandAssetId,
    brandId: 'b-1' as BrandAsset['brandId'],
    kind: 'color',
    source: 'inline',
    value: '#b5573c',
    role: null,
    status: 'active',
    library,
    label,
    position,
    deletedAt: null,
    createdAt: T0,
    updatedAt: T0,
  } as BrandAsset
}

const COLORS = [
  color('a-1', 'Terracotta', 100),
  color('a-2', 'Olive', 200),
  color('a-3', 'Ink', 300),
]

function renderPage(library: AssetLibrary = 'identity') {
  return render(<AssetLibraryPage brandId="b-1" library={library} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  state.assets = COLORS
  state.assetsPending = false
  state.assetsError = false
  state.brandPending = false
  state.brandError = false
})

describe('AssetLibraryPage — gating', () => {
  // Both queries, not just the assets one: `AssetLibraryView` needs the brand
  // for its header, so a loaded asset list over a failed brand is not a page.
  it.each([
    ['the brand is still loading', { brandPending: true }],
    ['the assets are still loading', { assetsPending: true }],
  ])('shows a loading shell while %s', (_name, over) => {
    Object.assign(state, over)
    renderPage()
    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it.each([
    ['the brand query failed', { brandError: true }],
    ['the asset query failed', { assetsError: true }],
  ])('explains rather than rendering an empty library when %s', (_name, over) => {
    Object.assign(state, over)
    renderPage()
    expect(screen.getByText(/Failed to load this brand/)).toBeTruthy()
  })

  it('passes the assets and a working blob resolver through', () => {
    renderPage()
    expect(screen.getByTestId('asset-count').textContent).toBe('3')
    expect(screen.getByTestId('resolved').textContent).toBe('/signed/k-1')
  })

  /**
   * **The shelf is a filter over one query.** `useBrandAssets` returns the whole
   * brand — the nav panel has it mounted on every page anyway — and each shelf
   * slices it. Without this the three routes would render the same page three
   * times under different headings.
   */
  it('renders only the assets filed on its own shelf', () => {
    state.assets = [
      color('a-1', 'Terracotta', 100),
      color('a-2', 'Menu', 100, 'collateral'),
      color('a-3', 'Storefront', 100, 'photography'),
    ]
    renderPage('collateral')
    expect(screen.getByTestId('asset-count').textContent).toBe('1')
  })

  it('renders an empty shelf without borrowing another’s rows', () => {
    state.assets = [color('a-1', 'Terracotta', 100)]
    renderPage('photography')
    expect(screen.getByTestId('asset-count').textContent).toBe('0')
  })
})

describe('AssetLibraryPage — reorder arithmetic', () => {
  /**
   * The reorder was N independent `PATCH`es until this pass and is now one
   * transactional call. What did not change is the arithmetic, and it had never
   * been asserted: ids arrive in their new visual order and become sparse
   * positions from 100.
   */
  it('turns the new order into sparse positions from 100', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire reorder'))
    expect(mutations.reorder).toHaveBeenCalledTimes(1)
    // Fired order is a-3, a-1, a-2 — every one of them moves from the 100 /
    // 200 / 300 the fixture starts at, so all three are sent.
    expect(mutations.reorder.mock.calls[0]?.[0]).toEqual([
      { id: 'a-3', position: 100 },
      { id: 'a-1', position: 200 },
      { id: 'a-2', position: 300 },
    ])
  })

  // Only the rows that actually moved. Dragging one swatch renumbers the tail,
  // not the whole ramp, and a row that lands on the position it already had is
  // not a write.
  it('omits a row whose position is unchanged by the move', () => {
    // a-2 is last in the fired order and already at 300; a-3 and a-1 swap.
    state.assets = [
      color('a-1', 'Terracotta', 100),
      color('a-2', 'Olive', 300),
      color('a-3', 'Ink', 200),
    ]
    renderPage()
    fireEvent.click(screen.getByText('fire reorder'))
    expect(mutations.reorder.mock.calls[0]?.[0]).toEqual([
      { id: 'a-3', position: 100 },
      { id: 'a-1', position: 200 },
    ])
  })

  // A drop that lands a swatch back where it started must not write. The stub
  // fires ['a-3','a-1','a-2'], so a list already in that order is a no-op.
  it('sends nothing at all when the order is unchanged', () => {
    state.assets = [
      color('a-3', 'Ink', 100),
      color('a-1', 'Terracotta', 200),
      color('a-2', 'Olive', 300),
    ]
    renderPage()
    fireEvent.click(screen.getByText('fire reorder'))
    expect(mutations.reorder).not.toHaveBeenCalled()
  })
})

describe('AssetLibraryPage — delete offers a way back', () => {
  /**
   * 1.10.0: *"a misclick is a disappearance. The fix is an Undo, not a
   * dialog."* The row was always recoverable — nothing sweeps its bytes — and
   * simply had no caller until this pass.
   */
  it('names the removed asset and offers Undo', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire delete'))
    const [id, opts] = mutations.del.mock.calls[0] as [
      string,
      { onSuccess: () => void; onError: (e: unknown) => void },
    ]
    expect(id).toBe('a-1')

    opts.onSuccess()
    const [message, config] = toastFn.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ]
    // The label, because a grid of thumbnails gives no other clue which row left.
    expect(message).toBe('Removed Terracotta')
    expect(config.action.label).toBe('Undo')

    config.action.onClick()
    expect(mutations.restore).toHaveBeenCalledWith('a-1', expect.anything())
  })

  it('reports a failed delete as an error and offers no Undo for it', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire delete'))
    const [, opts] = mutations.del.mock.calls[0] as [string, { onError: (e: unknown) => void }]
    opts.onError(new Error('nope'))
    expect(toastError).toHaveBeenCalledWith('Could not remove that asset')
    expect(toastFn).not.toHaveBeenCalled()
  })
})

describe('AssetLibraryPage — the other writes', () => {
  it('passes a patch straight through', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire update'))
    expect(mutations.update.mock.calls[0]?.[0]).toEqual({ id: 'a-1', patch: { label: 'Rust' } })
  })

  it('creates a colour as an inline asset', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire add colour'))
    expect(mutations.create.mock.calls[0]?.[0]).toMatchObject({
      kind: 'color',
      source: 'inline',
      label: 'Olive',
    })
  })

  /**
   * **Filed explicitly, not left to the server's default.**
   *
   * `defaultLibraryFor` would also answer `identity` for a colour, so omitting
   * the key would look correct today — and would make the page's filing depend
   * on a rule written for rows that predate the column. The literal is the
   * point, and it is `'identity'` rather than the page's `library` prop: a
   * colour is identity wherever you happen to be standing.
   *
   * Phase F added the other half of this guard — the page withholds
   * `onAddColor` from the other two shelves entirely — so the two together mean
   * a mis-shelved swatch is unrepresentable rather than merely unlikely.
   */
  it('files a colour as identity explicitly', () => {
    renderPage('identity')
    fireEvent.click(screen.getByText('fire add colour'))
    expect(mutations.create.mock.calls[0]?.[0]).toMatchObject({
      kind: 'color',
      library: 'identity',
    })
  })
})

describe('AssetLibraryPage — Move to… offers a way back', () => {
  /**
   * A move takes the row **off the page you are looking at**, which is the same
   * disappearance a delete is — so it gets the same treatment: a toast naming
   * the destination, and an Undo. 1.10.0 shipped a delete without one and named
   * the gap; a misfile with no way back is that failure wearing a different verb.
   *
   * The Undo is a second `updateAsset` rather than a `restoreAsset`: nothing was
   * deleted, so the way back is the same door in the other direction.
   */
  it('names the destination and moves it back on Undo', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire move'))
    const [, opts] = mutations.update.mock.calls[0] as [
      unknown,
      { onSuccess: () => void; onError: (e: unknown) => void },
    ]
    opts.onSuccess()

    const [message, config] = toastFn.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ]
    expect(message).toBe('Moved Terracotta to Collateral')
    expect(config.action.label).toBe('Undo')

    config.action.onClick()
    // Back to the shelf it came from — read off the row, not assumed to be the
    // page's own library, so an Undo is correct even from a stale render.
    expect(mutations.update.mock.calls[1]?.[0]).toEqual({
      id: 'a-1',
      patch: { library: 'identity' },
    })
  })

  // An ordinary patch is not a move, and must not raise a toast claiming one.
  it('says nothing for a patch that is not a move', () => {
    renderPage()
    fireEvent.click(screen.getByText('fire update'))
    const [, opts] = mutations.update.mock.calls[0] as [unknown, { onSuccess: () => void }]
    opts.onSuccess()
    expect(toastFn).not.toHaveBeenCalled()
  })
})

describe('AssetLibraryPage — the Add-colour gate', () => {
  // A colour belongs to the identity shelf and nowhere else. The gate is the
  // callback rather than a branch in the view, which is the view's own rule:
  // an affordance exists exactly when its callback does.
  it('passes onAddColor on identity and withholds it elsewhere', () => {
    renderPage('identity')
    expect(screen.getByTestId('has-add-colour').textContent).toBe('yes')
    cleanup()
    renderPage('photography')
    expect(screen.getByTestId('has-add-colour').textContent).toBe('no')
  })
})
