import Image from 'next/image'

import { currentBrand, remote, report, upload as send } from '@/lib/remote'

/** Uploads to the brand on screen; a failure says so before it rejects. */
async function upload(file: File, meta: { durationS?: number } = {}) {
  try {
    return await send(currentBrand(), file, meta)
  } catch (err) {
    report(`${file.name} did not upload.`)
    throw err
  }
}

/**
 * Media is a URL string everywhere in the demo. A file the user drops is a `blob:` URL, which
 * carries no extension, so the kind rides on the fragment: `blob:…#video`. Browsers ignore the
 * fragment when they load the file. The demo's own videos carry the fragment too, so one rule
 * tells the kind: `/demo/…/reel.mp4#video`.
 */
export interface Dropped {
  src: string
  /** m:ss, for a video. */
  duration?: string
}

/**
 * Reads a dropped file into a media URL; a video also gives its length. With the server on, the
 * file is uploaded and the URL is its stable address, so it survives a reload.
 */
export async function fromFile(file: File): Promise<Dropped> {
  const url = URL.createObjectURL(file)
  if (!file.type.startsWith('video/')) {
    if (remote) {
      URL.revokeObjectURL(url)
      return { src: await upload(file) }
    }
    return { src: `${url}#photo` }
  }
  const seconds = await new Promise<number>((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => resolve(v.duration)
    v.onerror = () => resolve(0)
    v.src = url
  })
  const s = Math.round(Number.isFinite(seconds) ? seconds : 0)
  if (remote) URL.revokeObjectURL(url)
  return {
    src: remote ? await upload(file, { durationS: s }) : `${url}#video`,
    duration: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  }
}

export function isVideo(src: string): boolean {
  return src.endsWith('#video')
}

/**
 * A demo video's poster: the JPEG beside it, `reel.mp4` → `reel.jpg`. A dropped video has none;
 * the browser shows its first frame instead.
 */
export function posterOf(src: string): string | undefined {
  const path = src.replace(/#.*$/, '')
  return isVideo(src) && path.endsWith('.mp4') ? path.replace(/\.mp4$/, '.jpg') : undefined
}

/**
 * Fills its positioned parent with a photo or a video. The demo's own photos go through
 * next/image; a dropped file is already in the browser, so it renders as it is. A video shows its
 * poster frame: a moving thumbnail distracts. Only the post's preview passes `play`, and the clip
 * then plays muted and loops, as the feed shows it.
 */
export function Media({
  src,
  sizes,
  play = false,
}: {
  src: string
  sizes: string
  play?: boolean
}) {
  const fill = 'absolute inset-0 size-full object-cover'
  if (isVideo(src)) {
    const poster = posterOf(src)
    if (!play && poster)
      return <Image src={poster} alt="" fill sizes={sizes} className="object-cover" />
    if (!play) return <video src={src} muted playsInline preload="metadata" className={fill} />
    return <video src={src} poster={poster} autoPlay muted loop playsInline className={fill} />
  }
  // A blob: URL, or an upload on the API, does not go through the image optimiser.
  if (src.startsWith('blob:') || /^https?:/.test(src))
    return <img src={src} alt="" className={fill} />
  return <Image src={src} alt="" fill sizes={sizes} className="object-cover" />
}
