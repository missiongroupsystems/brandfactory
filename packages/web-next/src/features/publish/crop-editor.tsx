'use client'

import * as React from 'react'

import { Segmented } from '@/components/controls'

import { ASPECTS, frameRatio, nudge, ZOOM_MAX, type Aspect, type Crop } from './model'
import { Framed } from './shot'

/**
 * The crop, live: the frame in the photo's shape or a platform's, a drag to slide the photo in
 * it, and a zoom. No rotate: a phone already straightens its photos, and one more control would
 * crowd the sheet. The caller keeps the crop and decides when it is kept or dropped.
 */
export function CropEditor({
  src,
  crop,
  onChange,
}: {
  src: string
  crop: Crop
  onChange: (crop: Crop) => void
}) {
  const box = React.useRef<HTMLDivElement>(null)
  // Where the drag began and the crop then: each move is measured from there, so two moves that
  // land before a render do not lose the first.
  const start = React.useRef<{ x: number; y: number; crop: Crop } | null>(null)

  function drag(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current || !box.current) return
    // The frame fits the box: as wide as it can be, or as tall, in the crop's shape.
    const rect = box.current.getBoundingClientRect()
    const ratio = frameRatio(crop)
    const width = Math.min(rect.width, rect.height * ratio)
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    onChange(nudge(start.current.crop, dx, dy, width, width / ratio))
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={box}
        role="img"
        aria-label="Drag to move the photo in its frame"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = { x: e.clientX, y: e.clientY, crop }
        }}
        onPointerMove={drag}
        onPointerUp={() => (start.current = null)}
        onPointerCancel={() => (start.current = null)}
        className="relative h-[400px] w-full cursor-grab touch-none overflow-hidden rounded-[14px] bg-tile select-none active:cursor-grabbing max-md:h-[360px]"
      >
        <Framed src={src} crop={crop} sizes="800px" />
      </div>
      <div className="max-md:[&_button]:h-10">
        <Segmented<Aspect>
          label="Shape"
          pill
          value={crop.aspect}
          onChange={(aspect) => onChange({ ...crop, aspect })}
          options={ASPECTS.map((a) => ({ value: a, label: a }))}
        />
      </div>
      <label className="flex h-9 items-center gap-3 text-[12.5px] text-ink-3">
        <span className="w-10 shrink-0">Zoom</span>
        <input
          type="range"
          min={1}
          max={ZOOM_MAX}
          step={0.01}
          value={crop.zoom}
          onChange={(e) => onChange({ ...crop, zoom: Number(e.target.value) })}
          className="h-1 w-full accent-ink"
        />
      </label>
    </div>
  )
}
