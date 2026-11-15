import { upload } from '@/lib/remote'

import { cropScale, type Crop } from './model'

/** Instagram shows a feed photo at most 1440 pixels wide; a larger cut only costs upload time. */
const LONGEST = 1440

/**
 * The part of the photo a crop keeps, as fractions of the photo: the same frame `Framed` draws.
 * The photo is `w` frames wide and `h` frames tall, slid off centre by the crop's offset.
 */
export function cutBox(crop: Crop) {
  const { w, h } = cropScale(crop)
  const tx = (crop.x * (w - 1)) / 2
  const ty = (crop.y * (h - 1)) / 2
  return { left: (w / 2 - 0.5 - tx) / w, top: (h / 2 - 0.5 - ty) / h, width: 1 / w, height: 1 / h }
}

/** The crop's own key: the same photo cut the same way is one file. */
const keyOf = (src: string, crop: Crop) =>
  `${src}|${crop.aspect}|${crop.zoom}|${crop.x}|${crop.y}|${crop.ratio}`

/** Each cut already uploaded in this tab, by its key. */
const made = new Map<string, Promise<string>>()

/**
 * The photo cut as the preview shows it, as a JPEG the brand owns, uploaded once per crop: the
 * file the post sends, so Instagram and Facebook get the crop, not the original. The original
 * stays with the post, so the next edit starts from the whole photo.
 */
export function cutPhoto(brandId: string, src: string, crop: Crop): Promise<string> {
  const key = keyOf(src, crop)
  let cut = made.get(key)
  if (!cut) {
    cut = render(src, crop).then((blob) =>
      upload(brandId, new File([blob], 'crop.jpg', { type: 'image/jpeg' })),
    )
    // A failed cut is tried again on the next save.
    cut.catch(() => made.delete(key))
    made.set(key, cut)
  }
  return cut
}

/** Remembers a cut the post already has, so saving it again uploads nothing. */
export function knownCut(src: string, crop: Crop, cutSrc: string) {
  made.set(keyOf(src, crop), Promise.resolve(cutSrc))
}

async function render(src: string, crop: Crop): Promise<Blob> {
  const unread = new Error('The cropped photo could not be made. Save again, or crop it again.')
  let photo: ImageBitmap
  try {
    const got = await fetch(src.replace(/#photo$/, ''))
    if (!got.ok) throw unread
    photo = await createImageBitmap(await got.blob())
  } catch {
    throw unread
  }
  const box = cutBox(crop)
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
