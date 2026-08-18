import { describe, expect, it } from 'vitest'
import { BrandAssetSchema, InfluencerSchema, SocialPostSchema } from '@brandfactory/shared'
import type { BrandAssetId, BrandId, ProseMirrorDoc } from '@brandfactory/shared'
import {
  rowToAgentMessage,
  rowToBrand,
  rowToBrandAsset,
  rowToBrandSummary,
  rowToCanvas,
  rowToCanvasBlock,
  rowToGuidelineSection,
  rowToInfluencer,
  rowToProject,
  rowToProjectSummary,
  rowToSocialPost,
  rowToWorkspace,
} from './mappers'

const TS = '2026-01-01T00:00:00.000Z'
const TEXT_DOC: ProseMirrorDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
}

const pmDoc = (...paragraphs: string[]): ProseMirrorDoc => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
})

// The shape `listBrandSummariesByWorkspace` selects. `tldrSection` defaults to
// `null` — the SQL result for the brands that have written no TL;DR, which is
// most of them.
const summaryRow = (
  overrides: { tldrSection?: { label: string; body: unknown } | null } = {},
): Parameters<typeof rowToBrandSummary>[0] => ({
  id: 'b-1',
  workspaceId: 'ws-1',
  name: 'Brand',
  description: null,
  websiteUrl: null,
  createdAt: TS,
  updatedAt: TS,
  sectionCount: 3,
  projectCount: 1,
  tldrSection: null,
  ...overrides,
})

describe('mappers — happy paths', () => {
  it('rowToWorkspace passes through fields with branded ids', () => {
    const row = {
      id: 'ws-1',
      name: 'Acme',
      ownerUserId: 'u-1',
      createdAt: TS,
      updatedAt: TS,
    }
    const ws = rowToWorkspace(row)
    expect(ws.id).toBe('ws-1')
    expect(ws.ownerUserId).toBe('u-1')
  })

  it('rowToBrand preserves nullable description', () => {
    const row = {
      id: 'b-1',
      workspaceId: 'ws-1',
      name: 'Brand',
      description: null,
      websiteUrl: null,
      createdAt: TS,
      updatedAt: TS,
    }
    const b = rowToBrand(row)
    expect(b.description).toBeNull()
  })

  // The column is nullable and every other brand fixture in the suite leaves it
  // null, so without this the mapper could drop `website_url` entirely and
  // nothing would notice.
  it('rowToBrand carries website_url through', () => {
    const b = rowToBrand({
      id: 'b-1',
      workspaceId: 'ws-1',
      name: 'Brand',
      description: null,
      websiteUrl: 'https://casavostra.com',
      createdAt: TS,
      updatedAt: TS,
    })
    expect(b.websiteUrl).toBe('https://casavostra.com')
  })

  it('rowToBrandSummary attaches section and project counts', () => {
    expect(rowToBrandSummary(summaryRow())).toMatchObject({
      id: 'b-1',
      sectionCount: 3,
      projectCount: 1,
    })
  })

  // The `jsonb_agg(…) -> 0` arm. The query's regex narrows the rows; this
  // mapper is what decides whether the row it got back is really the TL;DR.
  it('rowToBrandSummary flattens the TL;DR section to one line', () => {
    const row = summaryRow({
      tldrSection: { label: 'TL;DR', body: pmDoc('A wine bar.', 'Warm, never precious.') },
    })
    expect(rowToBrandSummary(row).tldr).toBe('A wine bar. Warm, never precious.')
  })

  it('rowToBrandSummary reports no TL;DR when the query found none', () => {
    expect(rowToBrandSummary(summaryRow()).tldr).toBeNull()
  })

  it('rowToBrandSummary reports no TL;DR for a section with an empty body', () => {
    const row = summaryRow({
      tldrSection: { label: 'TL;DR', body: { type: 'doc', content: [{ type: 'paragraph' }] } },
    })
    expect(rowToBrandSummary(row).tldr).toBeNull()
  })

  it('rowToBrandSummary accepts however the TL;DR label was punctuated', () => {
    for (const spelling of ['TLDR', 'tl;dr', 'TL-DR']) {
      const row = summaryRow({ tldrSection: { label: spelling, body: pmDoc('A wine bar.') } })
      expect(rowToBrandSummary(row).tldr).toBe('A wine bar.')
    }
  })

  // The prefilter is deliberately looser than `normaliseSectionLabel`, so a row
  // the SQL let through must still lose here. Without this re-check the query's
  // regex would be the rule, in a second place, in another language.
  it('rowToBrandSummary discards a row the shared label rule rejects', () => {
    const row = summaryRow({ tldrSection: { label: 'Voice & tone', body: pmDoc('Warm.') } })
    expect(rowToBrandSummary(row).tldr).toBeNull()
  })

  it('rowToProjectSummary normalizes Date lastActivityAt to ISO string', () => {
    const when = new Date('2026-04-20T12:00:00.000Z')
    const summary = rowToProjectSummary({
      id: 'p-1',
      brandId: 'b-1',
      kind: 'freeform',
      templateId: null,
      name: 'Proj',
      createdAt: TS,
      updatedAt: TS,
      brandName: 'Acme',
      lastActivityAt: when,
    })
    expect(summary.brandName).toBe('Acme')
    expect(summary.lastActivityAt).toBe('2026-04-20T12:00:00.000Z')
    expect(summary.kind).toBe('freeform')
  })

  it('rowToCanvas passes through', () => {
    const row = { id: 'c-1', projectId: 'p-1', createdAt: TS, updatedAt: TS }
    expect(rowToCanvas(row).projectId).toBe('p-1')
  })

  it('rowToGuidelineSection parses a valid ProseMirror body', () => {
    const row = {
      id: 'gs-1',
      brandId: 'b-1',
      label: 'Voice',
      body: TEXT_DOC,
      priority: 1,
      createdBy: 'user' as const,
      createdAt: TS,
      updatedAt: TS,
    }
    expect(rowToGuidelineSection(row).body).toEqual(TEXT_DOC)
  })

  it('rowToProject discriminates freeform vs standardized', () => {
    const base = {
      id: 'p-1',
      brandId: 'b-1',
      name: 'Proj',
      createdAt: TS,
      updatedAt: TS,
    }
    expect(rowToProject({ ...base, kind: 'freeform', templateId: null })).toMatchObject({
      kind: 'freeform',
    })
    expect(
      rowToProject({ ...base, kind: 'standardized', templateId: 'content-calendar' }),
    ).toMatchObject({ kind: 'standardized', templateId: 'content-calendar' })
  })

  it('rowToCanvasBlock text variant parses body', () => {
    const row = {
      id: 'bk-1',
      canvasId: 'c-1',
      kind: 'text' as const,
      position: 1,
      isPinned: false,
      pinnedAt: null,
      createdBy: 'user' as const,
      deletedAt: null,
      createdAt: TS,
      updatedAt: TS,
      body: TEXT_DOC,
      blobKey: null,
      alt: null,
      width: null,
      height: null,
      filename: null,
      mime: null,
    }
    const block = rowToCanvasBlock(row)
    expect(block.kind).toBe('text')
    if (block.kind === 'text') expect(block.body).toEqual(TEXT_DOC)
  })

  it('rowToAgentMessage drops DB-only fields and emits the AgentMessage wire shape', () => {
    const row = {
      id: 'am-1',
      projectId: 'p-1',
      role: 'assistant' as const,
      content: 'Hello from the model.',
      userId: null,
      createdAt: TS,
    }
    const msg = rowToAgentMessage(row)
    expect(msg.kind).toBe('message')
    expect(msg.id).toBe('am-1')
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBe('Hello from the model.')
  })

  it('rowToCanvasBlock image variant includes optional dims', () => {
    const row = {
      id: 'bk-2',
      canvasId: 'c-1',
      kind: 'image' as const,
      position: 2,
      isPinned: true,
      pinnedAt: TS,
      createdBy: 'agent' as const,
      deletedAt: null,
      createdAt: TS,
      updatedAt: TS,
      body: null,
      blobKey: 'blobs/img.png',
      alt: 'A logo',
      width: 200,
      height: 100,
      filename: null,
      mime: null,
    }
    const block = rowToCanvasBlock(row)
    expect(block.kind).toBe('image')
    if (block.kind === 'image') {
      expect(block.blobKey).toBe('blobs/img.png')
      expect(block.alt).toBe('A logo')
      expect(block.width).toBe(200)
    }
  })
})

describe('rowToBrandAsset', () => {
  const assetRow = {
    id: 'a-1',
    brandId: 'b-1',
    kind: 'color' as const,
    source: 'inline' as const,
    role: null,
    status: 'active' as const,
    library: 'identity' as const,
    label: 'Terracotta',
    value: '#b5573c',
    blobKey: null,
    url: null,
    alt: null,
    mime: null,
    filename: null,
    width: null,
    height: null,
    sizeBytes: null,
    position: 100,
    deletedAt: null,
    createdAt: TS,
    updatedAt: TS,
  }

  it('narrows to the arm named by source', () => {
    const inline = rowToBrandAsset(assetRow)
    expect(inline.source).toBe('inline')
    if (inline.source === 'inline') expect(inline.value).toBe('#b5573c')

    const blob = rowToBrandAsset({
      ...assetRow,
      kind: 'image',
      source: 'blob',
      value: null,
      blobKey: 'brands/mark.svg',
    })
    if (blob.source === 'blob') expect(blob.blobKey).toBe('brands/mark.svg')

    const link = rowToBrandAsset({
      ...assetRow,
      kind: 'image',
      source: 'link',
      value: null,
      url: 'https://cdn.example.com/a.svg',
    })
    if (link.source === 'link') expect(link.url).toBe('https://cdn.example.com/a.svg')
  })

  // The two columns the 1.8.0 mockup found missing. Both are nullable, so a
  // mapper that dropped them would leave every other assertion here green.
  it('carries alt and size_bytes through', () => {
    const a = rowToBrandAsset({
      ...assetRow,
      kind: 'image',
      source: 'blob',
      value: null,
      blobKey: 'brands/photo.jpg',
      alt: 'The back room at 7pm',
      sizeBytes: 842_100,
      width: 320,
      height: 240,
      mime: 'image/jpeg',
      filename: 'back-room.jpg',
    })
    expect(a).toMatchObject({
      alt: 'The back room at 7pm',
      sizeBytes: 842_100,
      width: 320,
      height: 240,
      mime: 'image/jpeg',
      filename: 'back-room.jpg',
    })
  })

  // A dropped `library` is not a null at the wire, it is an *absent* key, and
  // the row schema requires it — so every asset in the app would fail to parse
  // on a one-line omission here. Asserted through `BrandAssetSchema` rather than
  // on the property, because parsing is what the omission actually breaks.
  it('carries library through, on every arm', () => {
    for (const over of [
      {},
      { kind: 'image' as const, source: 'blob' as const, value: null, blobKey: 'k/1' },
      { kind: 'image' as const, source: 'link' as const, value: null, url: 'https://x.test/a.svg' },
    ]) {
      const mapped = rowToBrandAsset({ ...assetRow, library: 'collateral', ...over })
      expect(mapped.library).toBe('collateral')
      expect(BrandAssetSchema.safeParse(mapped).success).toBe(true)
    }
  })

  it('normalises deletedAt without turning null into a date', () => {
    expect(rowToBrandAsset(assetRow).deletedAt).toBeNull()
    expect(
      rowToBrandAsset({ ...assetRow, deletedAt: '2026-07-22 07:57:59.635905+00' }).deletedAt,
    ).toBe('2026-07-22T07:57:59.635Z')
  })

  // The CHECK guarantees the source column is present, so a null here means the
  // constraint is gone — a data-integrity bug, not a state to degrade into.
  it.each([
    ['inline', { source: 'inline' as const, value: null }, /missing value/],
    ['blob', { source: 'blob' as const, value: null, blobKey: null }, /missing blobKey/],
    ['link', { source: 'link' as const, value: null, url: null }, /missing url/],
  ])('throws when a %s row has lost its source column', (_name, columns, message) => {
    expect(() => rowToBrandAsset({ ...assetRow, ...columns })).toThrow(message)
  })
})

describe('rowToSocialPost', () => {
  const postRow = {
    id: 'p-1',
    brandId: 'b-1',
    platform: 'instagram' as const,
    scheduledAt: null,
    body: '',
    status: 'draft' as const,
    createdBy: 'user' as const,
    deletedAt: null,
    createdAt: TS,
    updatedAt: TS,
  }

  // The wire shape is the proof: Postgres-format timestamps normalised to ISO
  // (or `bySchedule`'s string comparison breaks), null slot and caller-order
  // assetIds carried through.
  it('parses as SocialPost with Postgres-format timestamps normalised', () => {
    const p = rowToSocialPost(
      {
        ...postRow,
        scheduledAt: '2026-08-14 10:30:00.123456+00',
        createdAt: '2026-07-22 07:57:59.635905+00',
        updatedAt: '2026-07-22 07:57:59.635905+00',
      },
      ['a-2', 'a-1'] as BrandAssetId[],
    )
    expect(SocialPostSchema.safeParse(p).success).toBe(true)
    expect(p.scheduledAt).toBe('2026-08-14T10:30:00.123Z')
    expect(p.assetIds).toEqual(['a-2', 'a-1'])
  })

  it('leaves null scheduledAt and deletedAt null', () => {
    const p = rowToSocialPost(postRow, [])
    expect(p.scheduledAt).toBeNull()
    expect(p.deletedAt).toBeNull()
  })

  it('carries the author through unchanged', () => {
    expect(rowToSocialPost({ ...postRow, createdBy: 'agent' }, []).createdBy).toBe('agent')
  })
})

describe('rowToInfluencer', () => {
  const influencerRow = {
    id: 'i-1',
    workspaceId: 'w-1',
    slug: 'priyaskin',
    name: 'Priya Nair',
    handle: 'priyaskin',
    platform: 'instagram' as const,
    followers: 124_000,
    // What `node-postgres` actually hands back for a `numeric(5,2)` column: text,
    // trailing zero and all. Never the number.
    engagementRate: '3.80',
    vertical: 'beauty' as const,
    status: 'active' as const,
    notes: null,
    createdAt: TS,
    updatedAt: TS,
  }

  // **The one shape trap in this aggregate.** `numeric` arrives as a string, it
  // type-checks clean either way, and the symptom is one row reading `3.80%` in a
  // column of `3.8%`. The wire schema is what catches it, so the wire schema is
  // what this asserts.
  it('converts the numeric engagement rate from the string pg returns', () => {
    const i = rowToInfluencer(influencerRow, [])
    expect(InfluencerSchema.safeParse(i).success).toBe(true)
    expect(i.engagementRate).toBe(3.8)
    expect(typeof i.engagementRate).toBe('number')
  })

  it('keeps an unmeasured rate null rather than turning it into zero', () => {
    // `Number(null)` is 0, which would state that nobody engages with this
    // creator — a measurement, where the truth is that nobody has measured.
    const i = rowToInfluencer({ ...influencerRow, engagementRate: null }, [])
    expect(i.engagementRate).toBeNull()
  })

  it('normalises Postgres-format timestamps', () => {
    const i = rowToInfluencer(
      {
        ...influencerRow,
        createdAt: '2026-07-22 07:57:59.635905+00',
        updatedAt: '2026-07-22 07:57:59.635905+00',
      },
      [],
    )
    expect(InfluencerSchema.safeParse(i).success).toBe(true)
    expect(i.createdAt).toBe('2026-07-22T07:57:59.635Z')
  })

  it('carries the brandIds the caller passed, empty array included', () => {
    expect(rowToInfluencer(influencerRow, ['b-1', 'b-2'] as BrandId[]).brandIds).toEqual([
      'b-1',
      'b-2',
    ])
    // Empty is a fact — "not engaged yet" — so it must survive as an array.
    expect(rowToInfluencer(influencerRow, []).brandIds).toEqual([])
  })

  it('keeps a generalist null rather than inventing a vertical', () => {
    expect(rowToInfluencer({ ...influencerRow, vertical: null }, []).vertical).toBeNull()
  })
})

describe('mappers — data-integrity failures fail loud', () => {
  it('rowToGuidelineSection throws on a malformed ProseMirror body', () => {
    const row = {
      id: 'gs-bad',
      brandId: 'b-1',
      label: 'Voice',
      // A circular-looking value simulated: Map isn't JSON, so the schema rejects.
      body: new Map() as unknown,
      priority: 1,
      createdBy: 'user' as const,
      createdAt: TS,
      updatedAt: TS,
    }
    expect(() => rowToGuidelineSection(row)).toThrow(/malformed ProseMirror body/)
  })

  it('rowToCanvasBlock text variant throws on a malformed body', () => {
    const row = {
      id: 'bk-bad',
      canvasId: 'c-1',
      kind: 'text' as const,
      position: 1,
      isPinned: false,
      pinnedAt: null,
      createdBy: 'user' as const,
      deletedAt: null,
      createdAt: TS,
      updatedAt: TS,
      body: new Map() as unknown,
      blobKey: null,
      alt: null,
      width: null,
      height: null,
      filename: null,
      mime: null,
    }
    expect(() => rowToCanvasBlock(row)).toThrow(/malformed ProseMirror body/)
  })

  it('rowToProject throws on a standardized row with null templateId', () => {
    expect(() =>
      rowToProject({
        id: 'p-bad',
        brandId: 'b-1',
        kind: 'standardized',
        name: 'Proj',
        templateId: null,
        createdAt: TS,
        updatedAt: TS,
      }),
    ).toThrow(/missing templateId/)
  })

  it('rowToCanvasBlock image variant throws on missing blobKey', () => {
    const row = {
      id: 'bk-bad-img',
      canvasId: 'c-1',
      kind: 'image' as const,
      position: 1,
      isPinned: false,
      pinnedAt: null,
      createdBy: 'user' as const,
      deletedAt: null,
      createdAt: TS,
      updatedAt: TS,
      body: null,
      blobKey: null,
      alt: null,
      width: null,
      height: null,
      filename: null,
      mime: null,
    }
    expect(() => rowToCanvasBlock(row)).toThrow(/missing blobKey/)
  })

  it('rowToCanvasBlock file variant throws on missing filename', () => {
    const row = {
      id: 'bk-bad-file',
      canvasId: 'c-1',
      kind: 'file' as const,
      position: 1,
      isPinned: false,
      pinnedAt: null,
      createdBy: 'user' as const,
      deletedAt: null,
      createdAt: TS,
      updatedAt: TS,
      body: null,
      blobKey: 'blobs/doc.pdf',
      alt: null,
      width: null,
      height: null,
      filename: null,
      mime: 'application/pdf',
    }
    expect(() => rowToCanvasBlock(row)).toThrow(/missing filename/)
  })
})

// Regression guard for the timestamp-format bug: Postgres hands back its own
// text format, not ISO 8601, and drizzle's `mode: 'string'` passes it through
// untouched. Every wire schema declares `z.iso.datetime()`, so mappers must
// normalise. Kept as a pure unit test — the live-DB suite that first caught
// this only runs when DATABASE_URL is set.
describe('mappers — timestamp normalisation', () => {
  const PG = '2026-07-22 07:57:59.635905+00'
  const ISO = '2026-07-22T07:57:59.635Z'

  it('converts Postgres text-format timestamps to ISO 8601', () => {
    const ws = rowToWorkspace({
      id: 'ws-1',
      name: 'Acme',
      ownerUserId: 'u-1',
      createdAt: PG,
      updatedAt: PG,
    })
    expect(ws.createdAt).toBe(ISO)
    expect(ws.updatedAt).toBe(ISO)
  })

  it('leaves already-ISO values unchanged', () => {
    const b = rowToBrand({
      id: 'b-1',
      workspaceId: 'ws-1',
      name: 'Acme',
      description: null,
      websiteUrl: null,
      createdAt: ISO,
      updatedAt: ISO,
    })
    expect(b.createdAt).toBe(ISO)
  })

  it('normalises nullable pinnedAt / deletedAt without turning null into a date', () => {
    const base = {
      id: 'cb-1',
      canvasId: 'c-1',
      kind: 'text' as const,
      body: TEXT_DOC,
      blobKey: null,
      alt: null,
      width: null,
      height: null,
      filename: null,
      mime: null,
      position: 1000,
      isPinned: true,
      createdBy: 'user' as const,
      createdAt: PG,
      updatedAt: PG,
    }
    const pinned = rowToCanvasBlock({ ...base, pinnedAt: PG, deletedAt: null })
    expect(pinned.pinnedAt).toBe(ISO)
    expect(pinned.deletedAt).toBeNull()

    const deleted = rowToCanvasBlock({ ...base, pinnedAt: null, deletedAt: PG })
    expect(deleted.pinnedAt).toBeNull()
    expect(deleted.deletedAt).toBe(ISO)
  })
})
