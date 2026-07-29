import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { BrandWithSections } from '@brandfactory/shared'
import { AssetLibraryView, formatBytes } from './AssetLibraryView'
import type { BrandAsset } from '@/demo/assetTypes'

const brand: BrandWithSections = {
  id: 'b-1' as BrandWithSections['id'],
  workspaceId: 'w-1' as BrandWithSections['workspaceId'],
  name: 'Casa Vostra',
  description: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  sections: [],
}

const uploaded: BrandAsset = {
  id: 'a-1',
  brandId: 'b-1',
  kind: 'image',
  source: 'blob',
  role: null,
  status: 'active',
  label: 'The back room',
  blobKey: 'k-1',
  sizeBytes: 842_100,
  position: 100,
  deletedAt: null,
}

const linked: BrandAsset = {
  id: 'a-2',
  brandId: 'b-1',
  kind: 'image',
  source: 'link',
  role: null,
  status: 'active',
  label: 'Terrace at dusk',
  url: '/terrace.svg',
  position: 200,
  deletedAt: null,
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
    expect(screen.getByAltText('Terrace at dusk').getAttribute('src')).toBe('/terrace.svg')
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
            id: 'a-3',
            brandId: 'b-1',
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
