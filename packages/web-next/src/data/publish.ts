/**
 * What the composer knows about each brand's accounts and files. Static and invented, like
 * `demo.ts`: the platforms each restaurant posts on, its caption drafts and hashtags, and its
 * Google Drive folder of final edits.
 *
 * The photos are the demo's own (see `public/demo/CREDITS.md`). A few are the moodboard's
 * landscape and tall pins, so a picked file can be the wrong shape (a tall pin in a post, a
 * landscape one in a reel) and show the flag.
 */

import type { BrandId } from './brands'

type ChannelKey = 'ig' | 'tt' | 'yt' | 'li' | 'fb'

/** The restaurants post on Instagram, TikTok and Facebook; none has YouTube or LinkedIn. */
export const LINKED: Record<BrandId, ChannelKey[]> = {
  'casa-vostra': ['ig', 'tt', 'fb'],
  temper: ['ig', 'tt', 'fb'],
  carlitos: ['ig', 'tt', 'fb'],
}

/**
 * Captions "Draft with AI" cycles through when the box is empty, each in its brand's voice. The
 * demo has no model behind it.
 */
export const CAPTION_DRAFTS: Record<BrandId, string[]> = {
  'casa-vostra': [
    'Ten seconds of fire, a crust that cracks 🔥 Blowtorch finish at Raffles City. #casavostra #pizzasg #rafflescity',
    'Smoke, blister, crack. The last ten seconds before your pizza lands 🔥 Raffles City. #casavostra #pizzasg',
  ],
  temper: [
    'The fire is lit and the first bottle is open. Duxton, from 5pm 🍷 #temper #winebarsg #duxton',
    'Something orange, something skin-contact, something we only have six of. Ask the floor. #temper #naturalwine',
  ],
  carlitos: [
    'Crunch first, then the jamón. Croquetas straight from the fryer, all night in Joo Chiat 🔥 #carlitossg #tapas #joochiat',
    'Pick a stool, pick a pintxo, pay by the stick. ¡Vamos! #carlitossg #pintxos #joochiat',
  ],
}

/** The hashtags each brand puts on every post: "Improve" adds the ones a caption is missing. */
export const HASHTAGS: Record<BrandId, string[]> = {
  'casa-vostra': ['#casavostra', '#pizzasg'],
  temper: ['#temper', '#winebarsg'],
  carlitos: ['#carlitossg', '#tapas'],
}

export interface DriveFile {
  name: string
  src: string
}

export interface DriveFolder {
  name: string
  folders: DriveFolder[]
  files: DriveFile[]
}

/** A brand's Drive, and the folder the picker opens on: this month's final edits. */
export interface Drive {
  root: DriveFolder
  start: string[]
}

const pin = (name: string) => `/demo/pins/${name}.jpg`

function month(name: string, files: DriveFile[]): DriveFolder {
  return { name, folders: [], files }
}

function drive(brand: string, months: DriveFolder[]): Drive {
  return {
    root: {
      name: brand,
      folders: [
        { name: 'Final edits', folders: months, files: [] },
        { name: 'Raw footage', folders: [], files: [] },
        { name: 'Brand assets', folders: [], files: [] },
      ],
      files: [],
    },
    start: ['Final edits', months[0]!.name],
  }
}

export const DRIVE: Record<BrandId, Drive> = {
  'casa-vostra': drive('Casa Vostra', [
    month('October', [
      { name: 'wine-night.jpg', src: '/demo/casa-vostra/wine-night.jpg' },
      { name: 'tagliatelle.jpg', src: '/demo/casa-vostra/tagliatelle.jpg' },
      { name: 'margherita.jpg', src: pin('cv-p-4') },
      { name: 'ravioli.jpg', src: '/demo/casa-vostra/ravioli.jpg' },
      { name: 'burrata.jpg', src: pin('cv-p-11') },
      { name: 'wood-oven.jpg', src: pin('cv-p-6') },
    ]),
    month('September', [
      { name: 'crust.jpg', src: '/demo/crust.jpg' },
      { name: 'pasta.jpg', src: '/demo/pasta.jpg' },
      { name: 'pizza-service.jpg', src: pin('cv-p-13') },
    ]),
    month('August', [{ name: 'dough.jpg', src: pin('cv-p-1') }]),
  ]),
  temper: drive('Temper', [
    month('October', [
      { name: 'pour.jpg', src: '/demo/temper/pour.jpg' },
      { name: 'glass.jpg', src: '/demo/temper/glass.jpg' },
      { name: 'candlelight.jpg', src: pin('tp-p-1') },
      { name: 'room.jpg', src: '/demo/temper/room.jpg' },
      { name: 'wine-table.jpg', src: pin('tp-p-7') },
      { name: 'red-glass.jpg', src: pin('tp-p-2') },
    ]),
    month('September', [
      { name: 'dish.jpg', src: '/demo/dish.jpg' },
      { name: 'bar-glow.jpg', src: pin('tp-p-8') },
    ]),
    month('August', [{ name: 'merlot.jpg', src: pin('tp-p-4') }]),
  ]),
  carlitos: drive('Carlitos', [
    month('October', [
      { name: 'croquetas.jpg', src: '/demo/carlitos/croquetas.jpg' },
      { name: 'pintxos.jpg', src: '/demo/carlitos/pintxos.jpg' },
      { name: 'joo-chiat.jpg', src: pin('ca-p-11') },
      { name: 'bravas.jpg', src: '/demo/carlitos/bravas.jpg' },
      { name: 'service.jpg', src: pin('ca-p-2') },
      { name: 'shophouse.jpg', src: pin('ca-p-13') },
    ]),
    month('September', [
      { name: 'bombas.jpg', src: '/demo/carlitos/bombas.jpg' },
      { name: 'jamon.jpg', src: '/demo/carlitos/jamon.jpg' },
    ]),
    month('August', [{ name: 'tapas-board.jpg', src: pin('ca-p-9') }]),
  ]),
}

/** The folder at `path` under the root, or the root when the path leads nowhere. */
export function folderAt(root: DriveFolder, path: string[]): DriveFolder {
  let at = root
  for (const name of path) {
    const next = at.folders.find((f) => f.name === name)
    if (!next) return root
    at = next
  }
  return at
}
