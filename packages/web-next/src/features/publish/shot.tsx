import { Media } from '@/components/media'

import {
  boxRatio,
  cropOffset,
  cropScale,
  frameRatio,
  type Crop,
  type Shot,
  type Shown,
} from './model'

/**
 * A photo cut to its crop, inside a positioned parent. The frame keeps the crop's shape and fits
 * the parent, as the apps letterbox a photo that is not their shape. The photo's box is the
 * photo's own shape, as many frames wide and tall as the crop says, so no part of it is clipped
 * before the frame cuts it; it is then slid off centre by the crop's offset.
 */
export function Framed({ src, crop, sizes }: { src: string; crop: Crop; sizes: string }) {
  const ratio = frameRatio(crop)
  const { w, h } = cropScale(crop)
  const { tx, ty } = cropOffset(crop)
  return (
    <span className="absolute inset-0 flex items-center justify-center [container-type:size]">
      <span
        className="relative overflow-hidden"
        style={{ aspectRatio: ratio, width: `min(100%, ${ratio * 100}cqh)` }}
      >
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            width: `${w * 100}%`,
            height: `${h * 100}%`,
            left: `calc(50% + ${tx}%)`,
            top: `calc(50% + ${ty}%)`,
          }}
        >
          <Media src={src} sizes={sizes} />
        </span>
      </span>
    </span>
  )
}

/**
 * The part of a photo Instagram shows (`Shown`), inside a positioned parent: the frame keeps that
 * part's shape and fits the parent, letterboxed as the app shows a photo that is not the post's
 * shape; the photo inside is sized and slid so only that part is in the frame.
 */
export function Boxed({ src, shown, sizes }: { src: string; shown: Shown; sizes: string }) {
  const { box, photo } = shown
  const ratio = boxRatio(box, photo)
  return (
    <span className="absolute inset-0 flex items-center justify-center [container-type:size]">
      <span
        className="relative overflow-hidden"
        style={{ aspectRatio: ratio, width: `min(100%, ${ratio * 100}cqh)` }}
      >
        <span
          className="absolute"
          style={{
            width: `${100 / box.width}%`,
            height: `${100 / box.height}%`,
            left: `${(-box.left / box.width) * 100}%`,
            top: `${(-box.top / box.height) * 100}%`,
          }}
        >
          <Media src={src} sizes={sizes} />
        </span>
      </span>
    </span>
  )
}

/**
 * A photo's width over its height, once it has loaded; null when it cannot load, so a photo that
 * did not load is never framed, cut or retagged on a guessed shape.
 */
export function ratioOf(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () =>
      resolve(
        img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null,
      )
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * A shot as the post shows it: the part Instagram shows when it is known (`shot.shown`), else
 * cropped if it was, else filling its parent. A video shows its poster frame unless `play` (the
 * preview) asks it to run; a video is never cropped.
 */
export function ShotView({
  shot,
  sizes,
  play = false,
}: {
  shot: Shot
  sizes: string
  play?: boolean
}) {
  if (shot.shown) return <Boxed src={shot.src} shown={shot.shown} sizes={sizes} />
  return shot.crop ? (
    <Framed src={shot.src} crop={shot.crop} sizes={sizes} />
  ) : (
    <Media src={shot.src} sizes={sizes} play={play} />
  )
}
