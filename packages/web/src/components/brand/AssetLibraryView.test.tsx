import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandAsset, BrandWithSections } from '@brandfactory/shared'
import { AssetLibraryView, formatBytes } from './AssetLibraryView'

// `BrandAsset` moved to `@brandfactory/shared` in 2A, where — like every other
// domain entity — it carries branded ids and the two timestamp columns the DB
// writes. Fixtures state them; nothing in this file reads them.
const ASSET_STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  // The pin, which nothing in this app reads yet: `packages/web` has no
  // photography grid and is not getting one. Stated here so the fixtures are
  // shaped like rows, and stated *once* so the next column added to
  // `BrandAsset` is one edit rather than a hunt through every literal.
  isPinned: false,
  pinnedAt: null,
  categoryId: null,
} as const

const brand: BrandWithSections = {
  id: 'b-1' as BrandWithSections['id'],
  workspaceId: 'w-1' as BrandWithSections['workspaceId'],
  name: 'Casa Vostra',
  description: null,
  websiteUrl: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  sections: [],
}

const uploaded: BrandAsset = {
  id: 'a-1' as BrandAsset['id'],
  brandId: 'b-1' as BrandAsset['brandId'],
  kind: 'image',
  library: 'photography',
  source: 'blob',
  role: null,
  status: 'active',
  label: 'The back room',
  blobKey: 'k-1',
  sizeBytes: 842_100,
  position: 100,
  deletedAt: null,
  ...ASSET_STAMPS,
}

const linked: BrandAsset = {
  id: 'a-2' as BrandAsset['id'],
  brandId: 'b-1' as BrandAsset['brandId'],
  kind: 'image',
  library: 'photography',
  source: 'link',
  role: null,
  status: 'active',
  label: 'Terrace at dusk',
  url: 'https://cdn.example.com/terrace.svg',
  position: 200,
  deletedAt: null,
  ...ASSET_STAMPS,
}

const resolve = (key: string) => `/blob/${key}`

describe('AssetLibraryView', () => {
  // Three shelves, three empty states — the one thing besides the section list
  // that differs by shelf. A single "no assets recorded" would be the shelves
  // reading as one page again, filtered.
  it.each([
    ['identity', /Upload a mark, add a colour/],
    ['photography', /No photography yet/],
    ['collateral', /No collateral yet/],
  ] as const)('says what belongs on the %s shelf when it is empty', (library, text) => {
    render(<AssetLibraryView brand={brand} library={library} assets={[]} resolveBlob={resolve} />)
    expect(screen.getByText(text)).toBeTruthy()
  })

  it.each([
    ['identity', 'Visual identity'],
    ['photography', 'Photography'],
    ['collateral', 'Collateral'],
  ] as const)('heads the %s shelf with its own title', (library, title) => {
    render(<AssetLibraryView brand={brand} library={library} assets={[]} resolveBlob={resolve} />)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy()
  })

  // The assets rule is that a link is first-class for reference while a blob is
  // expected for anything rendered as the brand's identity — encouraged in the
  // UI, not enforced in the schema. A rule the UI cannot show is a rule nobody
  // can follow, so it is a pill on the card and not a tooltip.
  it('distinguishes an uploaded asset from a linked one on the card', () => {
    render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[uploaded, linked]}
        resolveBlob={resolve}
      />,
    )
    expect(screen.getByText('Uploaded')).toBeTruthy()
    expect(screen.getByText('Linked')).toBeTruthy()
  })

  it('resolves a blob through the accessor and a link straight through', () => {
    render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[uploaded, linked]}
        resolveBlob={resolve}
      />,
    )
    expect(screen.getByAltText('The back room').getAttribute('src')).toBe('/blob/k-1')
    expect(screen.getByAltText('Terrace at dusk').getAttribute('src')).toBe(
      'https://cdn.example.com/terrace.svg',
    )
  })

  // Same fallback `BrandMark` takes, for the same reason: a link that does not
  // render is the expected outcome of the link path, and the grid has to say so
  // without leaving the browser's broken-image glyph in it.
  it('degrades a broken image to a caption rather than a broken glyph', () => {
    render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[linked]}
        resolveBlob={resolve}
      />,
    )
    fireEvent.error(screen.getByAltText('Terrace at dusk'))
    expect(screen.getByText('Did not render')).toBeTruthy()
  })

  /**
   * **This replaces `separates marks from photography`**, which asserted the
   * derivation the `library` column removed: *an image with no role is a
   * photograph*. The section now comes from where the asset is filed, so a mark
   * is a mark on the shelf it was filed to and the other two shelves have no
   * `Marks` heading to give it.
   */
  it('draws Marks only on the identity shelf', () => {
    const mark = { ...uploaded, library: 'identity' as const, role: 'logo' as const }
    render(
      <AssetLibraryView brand={brand} library="identity" assets={[mark]} resolveBlob={resolve} />,
    )
    expect(screen.getByRole('heading', { name: 'Marks' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Photographs' })).toBeNull()
  })

  /**
   * **An identity image with no role must still render**, and this is the case
   * that catches it: an image dropped on this shelf has no role until someone
   * clicks `Use as mark`, so a Marks grid filtered to `role: logo | mark` would
   * show nothing for it — an asset counted in the nav, filed on this shelf, and
   * visible nowhere, with the one control that would give it a role unreachable.
   *
   * Found by mutation-testing this file, not by writing it.
   */
  it('shows an identity image that has no role yet, with the way to mark it', () => {
    const unmarked = { ...uploaded, library: 'identity' as const, role: null }
    render(
      <AssetLibraryView
        brand={brand}
        library="identity"
        assets={[unmarked]}
        resolveBlob={resolve}
        onUpdateAsset={vi.fn()}
        onDeleteAsset={vi.fn()}
      />,
    )
    expect(screen.getByText('The back room')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use as mark' })).toBeTruthy()
  })

  /**
   * **The proposal's §2 table, as an assertion.** A printable menu exported as
   * a PNG is the ask's own example, and under the old derivation it was
   * photography — an image with no role. Filed to collateral it appears under
   * Collateral's grid, and Photography does not claim it.
   */
  it('shows a PNG filed as collateral under Collateral, not Photography', () => {
    const menu = { ...uploaded, library: 'collateral' as const, label: 'Menu, A4' }
    const { unmount } = render(
      <AssetLibraryView brand={brand} library="collateral" assets={[menu]} resolveBlob={resolve} />,
    )
    expect(screen.getByRole('heading', { name: 'Printed and designed' })).toBeTruthy()
    expect(screen.getByText('Menu, A4')).toBeTruthy()
    unmount()

    // The photography shelf is handed the rows filed to *it*, so the menu is
    // simply not among them — which is the whole point of the column.
    render(
      <AssetLibraryView brand={brand} library="photography" assets={[]} resolveBlob={resolve} />,
    )
    expect(screen.queryByText('Menu, A4')).toBeNull()
  })

  // The palette, the marks grid and the Add-colour row are identity's alone.
  // On another shelf they are not merely empty — there is no heading for them.
  it.each(['photography', 'collateral'] as const)(
    'draws no palette or marks section on the %s shelf',
    (library) => {
      render(
        <AssetLibraryView
          brand={brand}
          library={library}
          assets={[uploaded]}
          resolveBlob={resolve}
          onAddColor={vi.fn()}
          onUpdateAsset={vi.fn()}
          onDeleteAsset={vi.fn()}
        />,
      )
      expect(screen.queryByRole('heading', { name: 'Palette' })).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Marks' })).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Typefaces' })).toBeNull()
    },
  )

  it('renders a file with no preview as a row, not an empty tile', () => {
    render(
      <AssetLibraryView
        brand={brand}
        library="collateral"
        assets={[
          {
            id: 'a-3' as BrandAsset['id'],
            brandId: 'b-1' as BrandAsset['brandId'],
            kind: 'file',
            library: 'collateral',
            source: 'blob',
            role: null,
            status: 'active',
            label: 'Brand deck, v3',
            blobKey: 'k-3',
            filename: 'deck.pdf',
            mime: 'application/pdf',
            sizeBytes: 6_815_744,
            position: 100,
            deletedAt: null,
            ...ASSET_STAMPS,
          },
        ]}
        resolveBlob={() => ''}
      />,
    )
    expect(screen.getByText('Brand deck, v3')).toBeTruthy()
    expect(screen.getByText(/deck\.pdf · application\/pdf · 6\.5 MB/)).toBeTruthy()
  })
})

describe('formatBytes', () => {
  it('scales and rounds', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(842_100)).toBe('822 KB')
    expect(formatBytes(6_815_744)).toBe('6.5 MB')
  })

  // Finding 1: the proposed schema has no `size_bytes`, so "unknown" is a real
  // state and the row has to survive it rather than print "0 B".
  it('returns null for an unknown size', () => {
    expect(formatBytes(null)).toBeNull()
    expect(formatBytes(undefined)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2E — the write affordances
// ---------------------------------------------------------------------------
//
// Every one is gated on its own callback, which is what keeps the demo route
// rendering this component read-only against fixtures with no QueryClient. The
// first describe below is that invariant; the rest exercise the controls.

const colour: BrandAsset = {
  id: 'c-1' as BrandAsset['id'],
  brandId: 'b-1' as BrandAsset['brandId'],
  kind: 'color',
  library: 'identity',
  source: 'inline',
  role: null,
  status: 'active',
  label: 'Terracotta',
  value: '#b5573c',
  position: 100,
  deletedAt: null,
  ...ASSET_STAMPS,
}

describe('AssetLibraryView — the absent-callback invariant', () => {
  it('renders no intake zone, no editing and no delete when given no callbacks', () => {
    render(
      <AssetLibraryView
        brand={brand}
        library="identity"
        assets={[colour, uploaded]}
        resolveBlob={resolve}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Choose files' })).toBeNull()
    expect(screen.queryByLabelText(/paste a URL/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add colour' })).toBeNull()
    // The read-only palette list is still there — reading never needed a callback.
    expect(screen.getByText('#b5573c')).toBeTruthy()
  })
})

describe('AssetLibraryView — palette editing', () => {
  function editable(over: Partial<React.ComponentProps<typeof AssetLibraryView>> = {}) {
    const props = {
      onUpdateAsset: vi.fn(),
      onDeleteAsset: vi.fn(),
      onAddColor: vi.fn(),
      onReorderColors: vi.fn(),
    }
    render(
      <AssetLibraryView
        brand={brand}
        library="identity"
        assets={[colour]}
        resolveBlob={resolve}
        {...props}
        {...over}
      />,
    )
    return props
  }

  // Committed on blur rather than per keystroke — a PATCH per character is
  // write amplification the row does not need.
  it('commits a renamed colour on blur, not on every keystroke', () => {
    const { onUpdateAsset } = editable()
    const input = screen.getByLabelText('Label for Terracotta')
    fireEvent.change(input, { target: { value: 'Terracotta 500' } })
    expect(onUpdateAsset).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onUpdateAsset).toHaveBeenCalledWith('c-1', { label: 'Terracotta 500' })
  })

  it('does not write an unchanged or emptied label', () => {
    const { onUpdateAsset } = editable()
    const input = screen.getByLabelText('Label for Terracotta')
    fireEvent.blur(input)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(onUpdateAsset).not.toHaveBeenCalled()
  })

  // `status` is the whole reason the column exists, so toggling it is one click.
  it('toggles a colour between settled and proposed', () => {
    const { onUpdateAsset } = editable()
    fireEvent.click(screen.getByRole('button', { name: 'Settled' }))
    expect(onUpdateAsset).toHaveBeenCalledWith('c-1', { status: 'proposed' })
  })

  it('deletes a colour by name', () => {
    const { onDeleteAsset } = editable()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Terracotta' }))
    expect(onDeleteAsset).toHaveBeenCalledWith('c-1')
  })

  it('adds a colour only once it has a name', () => {
    const { onAddColor } = editable()
    const add = screen.getByRole('button', { name: 'Add colour' })
    expect(add.hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('New colour name'), { target: { value: 'Olive' } })
    fireEvent.click(add)
    expect(onAddColor).toHaveBeenCalledWith({ label: 'Olive', value: '#b5573c' })
  })

  // The swatch ramp is the reading view and the rows are the editing view —
  // two renderings of one list, which is why the swatches were not replaced.
  it('keeps the swatch ramp alongside the editable rows', () => {
    editable()
    expect(screen.getByText('Terracotta — #b5573c')).toBeTruthy()
    expect(screen.getByLabelText('Label for Terracotta')).toBeTruthy()
  })

  // A brand with no colours still gets the add row, or a palette could never
  // be started from this page.
  it('offers the add row for a brand with no colours at all', () => {
    render(
      <AssetLibraryView
        brand={brand}
        library="identity"
        assets={[]}
        resolveBlob={resolve}
        onAddColor={vi.fn()}
        onUpdateAsset={vi.fn()}
        onDeleteAsset={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add colour' })).toBeTruthy()
  })
})

describe('AssetLibraryView — recording a link', () => {
  it('renders the refusal inline, next to the field still holding the URL', async () => {
    const onRecordLink = vi.fn(async () => 'That URL didn’t load as an image.')
    render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[]}
        resolveBlob={resolve}
        onRecordLink={onRecordLink}
      />,
    )
    const input = screen.getByLabelText(/paste a URL/i)
    fireEvent.change(input, { target: { value: 'https://drive.google.com/file/d/x/view' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/didn’t load as an image/)
    // The URL survives the refusal — the user has to be able to fix it.
    expect((input as HTMLInputElement).value).toBe('https://drive.google.com/file/d/x/view')
  })

  it('clears the field on success', async () => {
    const onRecordLink = vi.fn(async () => null)
    render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[]}
        resolveBlob={resolve}
        onRecordLink={onRecordLink}
      />,
    )
    const input = screen.getByLabelText(/paste a URL/i)
    fireEvent.change(input, { target: { value: 'https://cdn.example.com/a.svg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }))

    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AssetLibraryView — uploading', () => {
  it('hands dropped files to the caller', () => {
    const onUploadFiles = vi.fn()
    render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[]}
        resolveBlob={resolve}
        onUploadFiles={onUploadFiles}
      />,
    )
    const zone = screen.getByText('Drop images or files here').closest('div')!
    const file = new File(['x'], 'mark.svg', { type: 'image/svg+xml' })
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(onUploadFiles).toHaveBeenCalledWith([file])
  })

  // 2F's keyboard walk — the first one any pass has run — landed on an unnamed
  // file input between the theme toggle and `Choose files`. `sr-only` hides a
  // proxy from the eye and not from a screen reader, which is the wrong half.
  it('keeps the hidden file input out of the tab order', () => {
    const { container } = render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[]}
        resolveBlob={resolve}
        onUploadFiles={vi.fn()}
      />,
    )
    const input = container.querySelector('input[type=file]')!
    expect(input.getAttribute('tabindex')).toBe('-1')
    expect(input.getAttribute('aria-hidden')).toBe('true')
    // The visible button is the control, and it keeps its name.
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeTruthy()
  })

  it('disables the picker while an upload is in flight', () => {
    render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[]}
        resolveBlob={resolve}
        onUploadFiles={vi.fn()}
        uploading
      />,
    )
    expect(screen.getByRole('button', { name: 'Uploading…' }).hasAttribute('disabled')).toBe(true)
  })
})

describe('AssetLibraryView — promoting a mark', () => {
  it('offers to use an image as the brand mark, and to stop', () => {
    const onUpdateAsset = vi.fn()
    const { rerender } = render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[uploaded]}
        resolveBlob={resolve}
        onUpdateAsset={onUpdateAsset}
        onDeleteAsset={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use as mark' }))
    expect(onUpdateAsset).toHaveBeenCalledWith('a-1', { role: 'logo' })

    rerender(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[{ ...uploaded, role: 'logo' }]}
        resolveBlob={resolve}
        onUpdateAsset={onUpdateAsset}
        onDeleteAsset={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Brand mark' }))
    expect(onUpdateAsset).toHaveBeenLastCalledWith('a-1', { role: null })
  })
})

describe('AssetLibraryView — Move to…', () => {
  const font: BrandAsset = {
    id: 'f-1' as BrandAsset['id'],
    brandId: 'b-1' as BrandAsset['brandId'],
    kind: 'file',
    library: 'identity',
    source: 'blob',
    role: 'typeface',
    status: 'active',
    label: 'Satoshi — headings',
    blobKey: 'k-font',
    filename: 'satoshi.woff2',
    mime: 'font/woff2',
    position: 100,
    deletedAt: null,
    ...ASSET_STAMPS,
  }

  /**
   * **The whole feature is one `PATCH`**, because C3 already made it work. What
   * this asserts is the two things the menu itself owes: the current shelf is
   * not offered (moving somewhere to where it already is), and the patch names
   * the destination and nothing else.
   */
  it('offers the two shelves an asset is not on, and patches the library', async () => {
    const user = userEvent.setup()
    const onUpdateAsset = vi.fn()
    render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[uploaded]}
        resolveBlob={resolve}
        onUpdateAsset={onUpdateAsset}
        onDeleteAsset={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Move The back room' }))

    const items = await screen.findAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual([
      'Move to Visual identity',
      'Move to Collateral',
    ])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Collateral' }))
    await waitFor(() =>
      expect(onUpdateAsset).toHaveBeenCalledWith('a-1', { library: 'collateral' }),
    )
  })

  it('offers Move to… on a file row as well as a grid card', async () => {
    const user = userEvent.setup()
    const onUpdateAsset = vi.fn()
    render(
      <AssetLibraryView
        brand={brand}
        library="identity"
        assets={[font]}
        resolveBlob={resolve}
        onUpdateAsset={onUpdateAsset}
        onDeleteAsset={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Move Satoshi — headings' }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Move to Photography', 'Move to Collateral'])
  })

  // Same rule as every other write on this page: the affordance exists exactly
  // when its callback does.
  it('renders no Move control without onUpdateAsset', () => {
    render(
      <AssetLibraryView
        brand={brand}
        library="photography"
        assets={[uploaded]}
        resolveBlob={resolve}
        onDeleteAsset={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull()
  })
})

describe('AssetLibraryView — typefaces', () => {
  const font: BrandAsset = {
    id: 'f-1' as BrandAsset['id'],
    brandId: 'b-1' as BrandAsset['brandId'],
    kind: 'file',
    library: 'identity',
    source: 'blob',
    role: null,
    status: 'active',
    label: 'Satoshi',
    blobKey: 'k-font',
    filename: 'satoshi.woff2',
    mime: 'font/woff2',
    position: 100,
    deletedAt: null,
    ...ASSET_STAMPS,
  }

  /**
   * **The role is the declaration, and the toggle is how it is made.** An
   * uploaded `.woff2` is an identity file until someone says it is the brand's
   * typeface — nothing here sniffs the mime, for the same reason migration 0011
   * backfills nothing.
   */
  it('files an unmarked font under Identity files, with a way to declare it', () => {
    const onUpdateAsset = vi.fn()
    render(
      <AssetLibraryView
        brand={brand}
        library="identity"
        assets={[font]}
        resolveBlob={resolve}
        onUpdateAsset={onUpdateAsset}
        onDeleteAsset={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Identity files' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Typefaces' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Use as typeface' }))
    expect(onUpdateAsset).toHaveBeenCalledWith('f-1', { role: 'typeface' })
  })

  it('moves a declared typeface into its own section, and offers to undeclare it', () => {
    const onUpdateAsset = vi.fn()
    render(
      <AssetLibraryView
        brand={brand}
        library="identity"
        assets={[{ ...font, role: 'typeface' }]}
        resolveBlob={resolve}
        onUpdateAsset={onUpdateAsset}
        onDeleteAsset={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Typefaces' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Identity files' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Typeface' }))
    expect(onUpdateAsset).toHaveBeenLastCalledWith('f-1', { role: null })
  })
})

describe('AssetLibraryView — the connected-sources note', () => {
  /**
   * **Copy, not a disabled `Connect a source` button with a `Soon` pill.** A
   * sentence tells the user the direction of travel *and* the thing they can do
   * right now, which is paste a URL; a disabled button tells them only the
   * first, and this repo has spent two passes removing affordances that go
   * nowhere.
   */
  it.each(['identity', 'photography', 'collateral'] as const)(
    'names connected sources as a later pass on the %s shelf',
    (library) => {
      render(
        <AssetLibraryView
          brand={brand}
          library={library}
          assets={[]}
          resolveBlob={resolve}
          onRecordLink={vi.fn()}
        />,
      )
      expect(
        screen.getByText(/Connected sources — Google Drive, Dropbox — are a later pass/),
      ).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Connect a source/ })).toBeNull()
    },
  )

  // Gated with the intake zone it belongs to: a note about how to add things,
  // on a page that cannot add things, is worse than silence.
  it('says nothing when there is no way to record a link', () => {
    render(<AssetLibraryView brand={brand} library="identity" assets={[]} resolveBlob={resolve} />)
    expect(screen.queryByText(/Connected sources/)).toBeNull()
  })
})
