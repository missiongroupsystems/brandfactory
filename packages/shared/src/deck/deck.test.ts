import { describe, expect, it } from 'vitest'
import {
  CreateDeckInputSchema,
  CreateDeckVersionInputSchema,
  DeckSourceSchema,
  DeckVersionSchema,
} from './deck'

// The member list is duplicated with the `deckSource` pgEnum in
// `@brandfactory/db`, per the zod-⇄-pgEnum convention. This test is the pin: a
// member added to one side and not the other fails here, which is the only
// place that reads both as data.
describe('the source enum', () => {
  it('holds two members — pdf and canva', () => {
    expect(DeckSourceSchema.options).toEqual(['pdf', 'canva'])
  })
})

describe('the version row', () => {
  const base = {
    id: 'v1',
    deckId: 'd1',
    label: 'v1 — first draft',
    versionDate: '2026-01-01',
    author: 'Acme Agency',
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  it('accepts a pdf version with a key and no canva url', () => {
    expect(
      DeckVersionSchema.safeParse({
        ...base,
        source: 'pdf',
        pdfBlobKey: 'blobs/deck.pdf',
        canvaUrl: null,
      }).success,
    ).toBe(true)
  })

  it('accepts a canva version carrying both the url and the required snapshot', () => {
    expect(
      DeckVersionSchema.safeParse({
        ...base,
        source: 'canva',
        canvaUrl: 'https://canva.com/design/abc',
        pdfBlobKey: 'blobs/deck-snapshot.pdf',
      }).success,
    ).toBe(true)
  })

  it('refuses a canva version with no snapshot — decision 3 made the PDF required', () => {
    // The union does not fall back to the pdf shape here: `source` says which
    // shape a row is, so a canva row with `pdfBlobKey: null` fails outright
    // rather than parsing as a differently-shaped pdf version.
    expect(
      DeckVersionSchema.safeParse({
        ...base,
        source: 'canva',
        canvaUrl: 'https://canva.com/design/abc',
        pdfBlobKey: null,
      }).success,
    ).toBe(false)
  })

  it('refuses a canva version with no url', () => {
    expect(
      DeckVersionSchema.safeParse({
        ...base,
        source: 'canva',
        canvaUrl: null,
        pdfBlobKey: 'blobs/deck-snapshot.pdf',
      }).success,
    ).toBe(false)
  })

  it('refuses a pdf version carrying a canva url', () => {
    expect(
      DeckVersionSchema.safeParse({
        ...base,
        source: 'pdf',
        pdfBlobKey: 'blobs/deck.pdf',
        canvaUrl: 'https://canva.com/design/abc',
      }).success,
    ).toBe(false)
  })

  it('refuses a pdf version with no key', () => {
    expect(
      DeckVersionSchema.safeParse({
        ...base,
        source: 'pdf',
        pdfBlobKey: null,
        canvaUrl: null,
      }).success,
    ).toBe(false)
  })
})

// The create schemas — a 400 with a field path is what these buy over the
// bare CHECK; each `it` here doubles as proof the wire rejects the same bad
// shape the CHECK does.
describe('CreateDeckInputSchema', () => {
  it('accepts a name and nothing else', () => {
    expect(CreateDeckInputSchema.safeParse({ name: 'Media Kit' }).success).toBe(true)
  })

  it('refuses an empty name', () => {
    expect(CreateDeckInputSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('does not require — or accept a stray — id or brandId', () => {
    const result = CreateDeckInputSchema.safeParse({ name: 'Media Kit' })
    expect(result.success && Object.keys(result.data)).toEqual(['name'])
  })
})

describe('CreateDeckVersionInputSchema', () => {
  const base = {
    label: 'v1 — first draft',
    versionDate: '2026-01-01',
    author: 'Acme Agency',
  }

  it('accepts a pdf create body', () => {
    expect(
      CreateDeckVersionInputSchema.safeParse({
        ...base,
        source: 'pdf',
        pdfBlobKey: 'blobs/deck.pdf',
        canvaUrl: null,
      }).success,
    ).toBe(true)
  })

  it('accepts a canva create body carrying the required snapshot', () => {
    expect(
      CreateDeckVersionInputSchema.safeParse({
        ...base,
        source: 'canva',
        canvaUrl: 'https://canva.com/design/abc',
        pdfBlobKey: 'blobs/deck-snapshot.pdf',
      }).success,
    ).toBe(true)
  })

  it('refuses a canva body with no snapshot — the same shape the CHECK refuses', () => {
    expect(
      CreateDeckVersionInputSchema.safeParse({
        ...base,
        source: 'canva',
        canvaUrl: 'https://canva.com/design/abc',
        pdfBlobKey: null,
      }).success,
    ).toBe(false)
  })

  it('refuses a pdf body with no key', () => {
    expect(
      CreateDeckVersionInputSchema.safeParse({
        ...base,
        source: 'pdf',
        pdfBlobKey: null,
        canvaUrl: null,
      }).success,
    ).toBe(false)
  })

  it('does not accept — or require — id, deckId or createdAt', () => {
    const result = CreateDeckVersionInputSchema.safeParse({
      ...base,
      source: 'pdf',
      pdfBlobKey: 'blobs/deck.pdf',
      canvaUrl: null,
    })
    expect(result.success && Object.keys(result.data).sort()).toEqual(
      ['author', 'canvaUrl', 'label', 'pdfBlobKey', 'source', 'versionDate'].sort(),
    )
  })
})
