import { Media } from '@/components/media'

import { cropOffset, cropScale, frameRatio, type Crop, type Shot } from './model'

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

/** A photo's width over its height, once it has loaded; square if it cannot load. */
export function ratioOf(src: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight)
    img.onerror = () => resolve(1)
    img.src = src
  })
}

/** A shot as the post shows it: cropped if it was, otherwise filling its parent. */
export function ShotView({ shot, sizes }: { shot: Shot; sizes: string }) {
  return shot.crop ? (
    <Framed src={shot.src} crop={shot.crop} sizes={sizes} />
  ) : (
    <Media src={shot.src} sizes={sizes} />
  )
}
