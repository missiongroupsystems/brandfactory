import { describe, expect, it } from 'vitest'

import type { BrandFile } from '@/data/brand-kit'
import { moodboardTag } from '@/data/brand-kit'

import {
  coloursEdited,
  hexOf,
  kindOf,
  plainTitle,
  removed,
  renamed,
  replaced,
  uploaded,
  voiceEdited,
} from './model'

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

describe('the voice and colours, after an edit', () => {
  const voice = {
    summary: 'Warm and quick.',
    words: [{ use: 'by hand', avoid: 'handcrafted' }],
    examples: ['Come hungry.'],
  }

  it('keeps the old summary when the edit leaves it blank, since AI drafts from it', () => {
    expect(voiceEdited(voice, { ...voice, summary: '  ' }).summary).toBe('Warm and quick.')
  })

  it('drops a half-filled pair and a blank line, so AI never reads a rule with one side', () => {
    const next = voiceEdited(voice, {
      summary: ' Loud. ',
      words: [...voice.words, { use: 'tapas', avoid: '' }, { use: ' share ', avoid: ' sample ' }],
      examples: ['Come hungry.', '   '],
    })
    expect(next).toEqual({
      summary: 'Loud.',
      words: [
        { use: 'by hand', avoid: 'handcrafted' },
        { use: 'share', avoid: 'sample' },
      ],
      examples: ['Come hungry.'],
    })
  })

  it('reads a hex the way people paste it, and refuses anything that is not one', () => {
    expect(hexOf('d9572b')).toBe('#D9572B')
    expect(hexOf(' #d52 ')).toBe('#DD5522')
    expect(hexOf('#D9572')).toBeNull()
    expect(hexOf('red')).toBeNull()
  })

  it('gives a colour a name when the edit leaves it blank', () => {
    expect(coloursEdited([{ name: ' ', hex: '#000000' }])).toEqual([
      { name: 'Untitled', hex: '#000000' },
    ])
  })
})

describe('the moodboard tag', () => {
  it("is the brand's name as one hashtag, so a DM'd post finds its board", () => {
    expect(moodboardTag({ name: 'Casa Vostra' })).toBe('#casavostra')
    expect(moodboardTag({ name: 'Carlitos' })).toBe('#carlitos')
  })
})
