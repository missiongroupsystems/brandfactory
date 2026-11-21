import { upload } from '@/lib/remote'

import type { Box } from './model'

/** Instagram shows a feed photo at most 1440 pixels wide; a larger cut only costs upload time. */
const LONGEST = 1440

/** The cut's own key: the same part of the same photo is one file. */
const keyOf = (src: string, box: Box) =>
  [src, box.left, box.top, box.width, box.height]
    .map((v) => (typeof v === 'number' ? v.toFixed(6) : v))
    .join('|')

/** Each cut already uploaded in this tab, by its key. */
const made = new Map<string, Promise<string>>()

/**
 * The part of the photo the preview shows (its crop, and the shape Instagram shows it in:
 * `feedFrames`), as a JPEG the brand owns, uploaded once per part: the file the post sends, so
 * Instagram and Facebook get what the preview and the tag editor show. The original stays with
 * the post, so the next edit starts from the whole photo.
 */
export function cutPhoto(brandId: string, src: string, box: Box): Promise<string> {
  const key = keyOf(src, box)
  let cut = made.get(key)
  if (!cut) {
    cut = render(src, box).then((blob) =>
      upload(brandId, new File([blob], 'crop.jpg', { type: 'image/jpeg' })),
    )
    // A failed cut is tried again on the next save.
    cut.catch(() => made.delete(key))
    made.set(key, cut)
  }
  return cut
}

/** Remembers a cut the post already has, so saving it again uploads nothing. */
export function knownCut(src: string, box: Box, cutSrc: string) {
  made.set(keyOf(src, box), Promise.resolve(cutSrc))
}

async function render(src: string, box: Box): Promise<Blob> {
  const unread = new Error('The cropped photo could not be made. Save again, or crop it again.')
  let photo: ImageBitmap
  try {
    const got = await fetch(src.replace(/#photo$/, ''))
    if (!got.ok) throw unread
    photo = await createImageBitmap(await got.blob())
  } catch {
    throw unread
  }
  const sw = box.width * photo.width
  const sh = box.height * photo.height
  const scale = Math.min(1, LONGEST / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  const pen = canvas.getContext('2d')
  if (!pen) throw new Error('This browser cannot crop the photo.')
  pen.drawImage(
    photo,
    box.left * photo.width,
    box.top * photo.height,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  photo.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The crop could not be made.'))),
      'image/jpeg',
      0.92,
    ),
  )
}
