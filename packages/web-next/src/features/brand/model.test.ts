import { describe, expect, it } from 'vitest'

import type { BrandFile } from '@/data/brand-kit'
import { moodboardTag } from '@/data/brand-kit'

import { kindOf, plainTitle, removed, renamed, replaced, uploaded } from './model'

const deck: BrandFile = {
  id: 'd',
  title: 'Brand deck 2025',
  kind: 'deck',
  name: 'CV_Brand_Deck_2025.pptx',
  updated: '2 Jun',
}

describe('brand files', () => {
  it('titles an upload in plain words from its name, first in the list', () => {
    // AI reads the title to know what a file is; "CV_brand-deck_v3" tells it little.
    const [first, second] = uploaded([deck], 'tone_of-voice_v3.docx', 'n')
    expect(first).toMatchObject({ title: 'Tone of voice v3', kind: 'doc', updated: 'Today' })
    expect(second).toBe(deck)
  })

  it("keeps the team's title when a new version of the file is uploaded", () => {
    const [next] = replaced([deck], 'd', 'deck-final.pdf')
    expect(next).toMatchObject({ title: 'Brand deck 2025', name: 'deck-final.pdf', kind: 'pdf' })
    expect(next!.updated).toBe('Today')
  })

  it('never lets a blank rename wipe a title', () => {
    expect(renamed([deck], 'd', '   ')).toEqual([deck])
    expect(renamed([deck], 'd', '  Sales deck ')[0]!.title).toBe('Sales deck')
  })

  it('deletes only the file asked for', () => {
    const other = { ...deck, id: 'o' }
    expect(removed([deck, other], 'd')).toEqual([other])
  })

  it('reads the kind from the extension, and a name with no dots stays as typed', () => {
    expect(kindOf('Logo.PNG')).toBe('image')
    expect(kindOf('wine_list.xlsx')).toBe('sheet')
    expect(plainTitle('README')).toBe('README')
  })
})

describe('the moodboard tag', () => {
  it("is the brand's name as one hashtag, so a DM'd post finds its board", () => {
    expect(moodboardTag({ name: 'Casa Vostra' })).toBe('#casavostra')
    expect(moodboardTag({ name: 'Carlitos' })).toBe('#carlitos')
  })
})
