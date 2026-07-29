import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BrandAsset, BrandWithSections } from '@brandfactory/shared'
import { AssetLibraryView, formatBytes } from './AssetLibraryView'

// `BrandAsset` moved to `@brandfactory/shared` in 2A, where — like every other
// domain entity — it carries branded ids and the two timestamp columns the DB
// writes. Fixtures state them; nothing in this file reads them.
const ASSET_STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
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
  it('says so plainly when a brand has no assets', () => {
    render(<AssetLibraryView brand={brand} assets={[]} resolveBlob={resolve} />)
    expect(screen.getByText(/This brand has no assets recorded/)).toBeTruthy()
  })

  // The assets rule is that a link is first-class for reference while a blob is
  // expected for anything rendered as the brand's identity — encouraged in the
  // UI, not enforced in the schema. A rule the UI cannot show is a rule nobody
  // can follow, so it is a pill on the card and not a tooltip.
  it('distinguishes an uploaded asset from a linked one on the card', () => {
    render(<AssetLibraryView brand={brand} assets={[uploaded, linked]} resolveBlob={resolve} />)
    expect(screen.getByText('Uploaded')).toBeTruthy()
    expect(screen.getByText('Linked')).toBeTruthy()
  })

  it('resolves a blob through the accessor and a link straight through', () => {
    render(<AssetLibraryView brand={brand} assets={[uploaded, linked]} resolveBlob={resolve} />)
    expect(screen.getByAltText('The back room').getAttribute('src')).toBe('/blob/k-1')
    expect(screen.getByAltText('Terrace at dusk').getAttribute('src')).toBe(
      'https://cdn.example.com/terrace.svg',
    )
  })

  // Same fallback `BrandMark` takes, for the same reason: a link that does not
  // render is the expected outcome of the link path, and the grid has to say so
  // without leaving the browser's broken-image glyph in it.
  it('degrades a broken image to a caption rather than a broken glyph', () => {
    render(<AssetLibraryView brand={brand} assets={[linked]} resolveBlob={resolve} />)
    fireEvent.error(screen.getByAltText('Terrace at dusk'))
    expect(screen.getByText('Did not render')).toBeTruthy()
  })

  it('separates marks from photography', () => {
    render(
      <AssetLibraryView
        brand={brand}
        assets={[{ ...uploaded, role: 'logo', label: 'Primary mark' }, linked]}
        resolveBlob={resolve}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Marks' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Photography' })).toBeTruthy()
  })

  it('renders a file with no preview as a row, not an empty tile', () => {
    render(
      <AssetLibraryView
        brand={brand}
        assets={[
          {
            id: 'a-3' as BrandAsset['id'],
            brandId: 'b-1' as BrandAsset['brandId'],
            kind: 'file',
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
    render(<AssetLibraryView brand={brand} assets={[colour, uploaded]} resolveBlob={resolve} />)
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
      <AssetLibraryView brand={brand} assets={[]} resolveBlob={resolve} onUploadFiles={vi.fn()} />,
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
