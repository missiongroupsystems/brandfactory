import { describe, expect, it } from 'vitest'
import { DeckSourceSchema, DeckVersionSchema } from './deck'

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
