import Image from 'next/image'

/**
 * Media is a URL string everywhere in the demo. A file the user drops is a `blob:` URL, which
 * carries no extension, so the kind rides on the fragment: `blob:…#video`. Browsers ignore the
 * fragment when they load the file.
 */
export interface Dropped {
  src: string
  /** m:ss, for a video. */
  duration?: string
}

/** Reads a dropped file into a media URL; a video also gives its length. */
export async function fromFile(file: File): Promise<Dropped> {
  const url = URL.createObjectURL(file)
  if (!file.type.startsWith('video/')) return { src: `${url}#photo` }
  const seconds = await new Promise<number>((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => resolve(v.duration)
    v.onerror = () => resolve(0)
    v.src = url
  })
  const s = Math.round(Number.isFinite(seconds) ? seconds : 0)
  return {
    src: `${url}#video`,
    duration: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  }
}

export function isVideo(src: string): boolean {
  return src.endsWith('#video')
}

/**
 * Fills its positioned parent with a photo or a video. The demo's own photos go through
 * next/image; a dropped file is already in the browser, so it renders as it is. A video plays
 * muted and loops, as every feed previews one.
 */
export function Media({ src, sizes }: { src: string; sizes: string }) {
  const fill = 'absolute inset-0 size-full object-cover'
  if (isVideo(src)) return <video src={src} autoPlay muted loop playsInline className={fill} />
  // A blob: URL cannot go through the image optimiser.
  if (src.startsWith('blob:')) return <img src={src} alt="" className={fill} />
  return <Image src={src} alt="" fill sizes={sizes} className="object-cover" />
}
