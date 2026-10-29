'use client'

import * as React from 'react'

import { cropScale, nudge, ZOOM_MAX, type Crop } from '@/features/publish/model'
import { Framed } from '@/features/publish/shot'

/** The side of the square the profile picture is saved at. */
export const AVATAR_PX = 512

const BUTTON = 'bb-press h-10 flex-1 rounded-full text-[14px] font-medium disabled:opacity-50'

/**
 * The part of the photo the square frame shows, in the photo's own pixels: the inverse of how
 * `Framed` draws a crop (the photo covers the frame, grows by the zoom, then slides by x and y).
 */
export function squareOf(crop: Crop, width: number, height: number) {
  const { w, h } = cropScale(crop)
  const left = (w / 2 - 0.5 - (crop.x * (w - 1)) / 2) / w
  const top = (h / 2 - 0.5 - (crop.y * (h - 1)) / 2) / h
  return { sx: left * width, sy: top * height, sw: width / w, sh: height / h }
}

/** The framed square as a 512×512 JPEG; a transparent PNG gets a white ground. */
function squareJpeg(img: HTMLImageElement, crop: Crop): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_PX
  canvas.height = AVATAR_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('This browser cannot crop the photo.'))
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX)
  ctx.imageSmoothingQuality = 'high'
  const { sx, sy, sw, sh } = squareOf(crop, img.naturalWidth, img.naturalHeight)
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, AVATAR_PX, AVATAR_PX)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The photo could not be cropped.'))),
      'image/jpeg',
      0.9,
    ),
  )
}

/**
 * The square crop of a new profile picture: drag to move the photo under the round mask, the
 * slider to zoom, as the post's crop does. Save hands the 512×512 JPEG to the page, which uploads it.
 */
export function AvatarCrop({
  file,
  busy,
  onCancel,
  onSave,
  onError,
}: {
  file: File
  busy: boolean
  onCancel: () => void
  onSave: (picture: Blob) => void
  onError: (message: string) => void
}) {
  const [src, setSrc] = React.useState<string | null>(null)
  const [crop, setCrop] = React.useState<Crop | null>(null)
  const img = React.useRef<HTMLImageElement | null>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const start = React.useRef<{ x: number; y: number; crop: Crop } | null>(null)

  // The chosen file, read once; the URL goes when the crop closes.
  React.useEffect(() => {
    const url = URL.createObjectURL(file)
    const photo = new window.Image()
    photo.onload = () => {
      img.current = photo
      setSrc(url)
      setCrop({
        aspect: '1:1',
        zoom: 1,
        x: 0,
        y: 0,
        ratio: photo.naturalWidth / photo.naturalHeight,
      })
    }
    photo.onerror = () => onError('This photo cannot be opened. Try a JPEG or PNG.')
    photo.src = url
    return () => {
      // Revoking the URL fails a load still running: that is not the photo failing.
      photo.onload = null
      photo.onerror = null
      URL.revokeObjectURL(url)
    }
    // One file per crop: the page opens a new crop for a new file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const side = () => box.current?.getBoundingClientRect().width ?? 0

  async function save() {
    if (!img.current || !crop) return
    try {
      onSave(await squareJpeg(img.current, crop))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'The photo could not be cropped.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={box}
        role="img"
        aria-label="Drag to move the photo in the circle"
        onPointerDown={(e) => {
          if (!crop) return
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = { x: e.clientX, y: e.clientY, crop }
        }}
        onPointerMove={(e) => {
          if (!start.current) return
          const s = side()
          setCrop(
            nudge(
              start.current.crop,
              e.clientX - start.current.x,
              e.clientY - start.current.y,
              s,
              s,
            ),
          )
        }}
        // The photo's own drag would cancel the pointer and end the pan after a few pixels.
        onDragStart={(e) => e.preventDefault()}
        onPointerUp={() => (start.current = null)}
        onPointerCancel={() => (start.current = null)}
        className="relative aspect-square w-full cursor-grab touch-none overflow-hidden rounded-[14px] bg-tile select-none active:cursor-grabbing"
      >
        {src && crop && <Framed src={src} crop={crop} sizes="360px" />}
        {/* The circle the header shows; outside it, the photo dims. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(0,0,0,0.45)]"
        />
      </div>
      <label className="flex h-9 items-center gap-3 text-[13px] text-ink-3">
        <span className="w-10 shrink-0">Zoom</span>
        <input
          type="range"
          min={1}
          max={ZOOM_MAX}
          step={0.01}
          value={crop?.zoom ?? 1}
          disabled={!crop}
          onChange={(e) => crop && setCrop({ ...crop, zoom: Number(e.target.value) })}
          className="h-1 w-full accent-ink"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          // The crop takes the place of the photo and its pencil, which had the focus.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          disabled={busy}
          className={`${BUTTON} border border-line text-ink-2 hover:bg-surface hover:text-ink`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || !crop}
          className={`${BUTTON} bg-ink text-page`}
        >
          {busy ? 'Uploading…' : 'Save photo'}
        </button>
      </div>
    </div>
  )
}
