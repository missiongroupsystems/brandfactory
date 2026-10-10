/**
 * Each brand's kit: how it sounds, its colours, its logo and the documents the team keeps about
 * it. Today these live in scattered Docs and Canva decks; the Brand page holds them in one place,
 * for a new hire to read and for AI drafts to write in the brand's voice. Invented, apart from
 * the logos, which are the brands' own.
 */

import type { Brand, BrandId } from './brands'

export type FileKind = 'pdf' | 'deck' | 'doc' | 'sheet' | 'image'

/** A document about the brand. The title is the team's own words; AI reads it to know what the file is. */
export interface BrandFile {
  id: string
  title: string
  kind: FileKind
  /** The file as it was uploaded: "Casa Vostra brand book v3.pdf". */
  name: string
  /** As printed: "12 Sep", or "Today" for a file uploaded now. */
  updated: string
}

export interface BrandKit {
  voice: {
    /** How the brand sounds, in two sentences. */
    summary: string
    /** A word to use, and the word it replaces. */
    words: Array<{ use: string; avoid: string }>
    /** Lines that sound like the brand. */
    examples: string[]
  }
  /** Brand colours, as hex: content to copy, not a colour of the app. */
  colours: Array<{ name: string; hex: string }>
  files: BrandFile[]
}

export const BRAND_KIT: Record<BrandId, BrandKit> = {
  'casa-vostra': {
    voice: {
      summary:
        'Warm, quick and a little cheeky, like a friend who cooks. We talk about the dough, the fire and the hands that make it, never about luxury.',
      words: [
        { use: 'made this morning', avoid: 'artisanal' },
        { use: 'wood-fired', avoid: 'authentic' },
        { use: 'come hungry', avoid: 'indulge' },
        { use: 'by hand', avoid: 'handcrafted' },
      ],
      examples: [
        'Rolled at 9, on your plate by 12. Tagliatelle, made this morning.',
        'Ten seconds of fire and a crust that cracks. Come hungry.',
      ],
    },
    colours: [
      { name: 'Terracotta', hex: '#D9572B' },
      { name: 'Flour', hex: '#F7F1E8' },
      { name: 'Basil', hex: '#3E6B48' },
      { name: 'Char', hex: '#1E1A17' },
    ],
    files: [
      {
        id: 'cv-book',
        title: 'Brand book',
        kind: 'pdf',
        name: 'Casa Vostra brand book v3.pdf',
        updated: '14 Aug',
      },
      {
        id: 'cv-deck',
        title: 'Brand deck 2025',
        kind: 'deck',
        name: 'CV_Brand_Deck_2025 (Canva).pdf',
        updated: '2 Jun',
      },
      {
        id: 'cv-menu',
        title: 'Menu and dish names',
        kind: 'doc',
        name: 'Menu copy - Raffles City.docx',
        updated: '28 Sep',
      },
      {
        id: 'cv-photo',
        title: 'Photo style: close, warm, no flash',
        kind: 'image',
        name: 'photo-direction.jpg',
        updated: '9 Jul',
      },
    ],
  },
  temper: {
    voice: {
      summary:
        'Low-lit and unhurried. Temper speaks like a good sommelier: curious, specific, never a snob. Short lines, room to breathe.',
      words: [
        { use: 'natural wine', avoid: 'organic vino' },
        { use: 'stay a while', avoid: 'chill vibes' },
        { use: 'on the pour', avoid: 'on tap' },
        { use: 'a glass', avoid: 'a drink' },
      ],
      examples: [
        'Skin contact, from a grower in Jura. On the pour until it runs out.',
        'Between dinner and the last train. Stay a while.',
      ],
    },
    colours: [
      { name: 'Bottle green', hex: '#1F2B27' },
      { name: 'Cream', hex: '#E9E1C6' },
      { name: 'Claret', hex: '#5B2333' },
      { name: 'Brass', hex: '#B08D57' },
    ],
    files: [
      {
        id: 'tp-voice',
        title: 'Tone of voice',
        kind: 'doc',
        name: 'Temper - ToV guide.docx',
        updated: '3 Sep',
      },
      {
        id: 'tp-deck',
        title: 'Brand deck',
        kind: 'deck',
        name: 'Temper Brand Deck (Canva).pdf',
        updated: '18 May',
      },
      {
        id: 'tp-list',
        title: 'Wine list, autumn',
        kind: 'sheet',
        name: 'wine_list_AW26.xlsx',
        updated: '1 Oct',
      },
    ],
  },
  carlitos: {
    voice: {
      summary:
        'Loud, warm and Spanish at heart, like the bar at ten at night. We name the dish, the region and the person behind the counter.',
      words: [
        { use: 'tapas', avoid: 'small plates' },
        { use: 'neighbourhood bar', avoid: 'concept' },
        { use: 'share', avoid: 'sample' },
        { use: 'jamón', avoid: 'ham' },
      ],
      examples: [
        'Bravas, the way Madrid does them. Order two, you will want both.',
        'Joo Chiat, ten o’clock, the jamón still on the bone.',
      ],
    },
    colours: [
      { name: 'Oxblood', hex: '#741A1D' },
      { name: 'Saffron', hex: '#E0A93B' },
      { name: 'Tile', hex: '#F3E6CF' },
      { name: 'Olive', hex: '#5C5A2E' },
    ],
    files: [
      {
        id: 'cl-book',
        title: 'Brand guidelines',
        kind: 'pdf',
        name: 'Carlitos_Guidelines_2024.pdf',
        updated: '11 Mar',
      },
      {
        id: 'cl-voice',
        title: 'How we talk on Instagram',
        kind: 'doc',
        name: 'IG captions - do and dont.docx',
        updated: '22 Sep',
      },
      {
        id: 'cl-deck',
        title: 'Opening deck',
        kind: 'deck',
        name: 'Carlitos launch (Canva).pdf',
        updated: '6 Feb',
      },
    ],
  },
}

/** The Instagram account the team DMs posts to; each post lands on a brand's moodboard by its tag. */
export const MOODBOARD_ACCOUNT = '@mission.moodboards'

/** The team's one Pinterest account, which keeps a board per brand. */
export const PINTEREST_ACCOUNT = 'Mission team'

/** The tag that sends a DM'd post to this brand's moodboard: "#casavostra". */
export function moodboardTag(brand: Pick<Brand, 'name'>): string {
  return `#${brand.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`
}
