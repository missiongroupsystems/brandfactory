'use client'

import * as React from 'react'

/**
 * Files dragged from the desktop onto the phone preview. Only a drag that carries files counts;
 * text dragged across it does nothing. While files hover, the frame grows a touch and a ring with
 * "Drop to add" fades in over it; both go on leave and on drop. `radius` matches the frame's.
 */
export function DropZone({
  onFiles,
  radius,
  children,
}: {
  onFiles: (files: FileList) => void | Promise<void>
  radius: number
  children: React.ReactNode
}) {
  const [over, setOver] = React.useState(false)
  // Each child the pointer crosses fires its own enter and leave; the frame is left when as
  // many leaves as enters have fired. (Safari gives no `relatedTarget` to tell them apart.)
  const depth = React.useRef(0)
  const withFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
  return (
    <div
      data-drop={over ? 'over' : undefined}
      onDragEnter={(e) => {
        if (!withFiles(e)) return
        e.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragOver={(e) => {
        if (!withFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        if (!withFiles(e)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      }}
      onDrop={(e) => {
        if (!withFiles(e)) return
        e.preventDefault()
        depth.current = 0
        setOver(false)
        void onFiles(e.dataTransfer.files)
      }}
      className={`relative transition-transform duration-200 ease-out ${over ? 'scale-[1.02]' : ''}`}
      style={{ borderRadius: radius }}
    >
      {children}
      {over && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex animate-[bb-fade_200ms_ease-out_both] items-center justify-center bg-page/55 shadow-[inset_0_0_0_2px_var(--ink)] backdrop-blur-[2px]"
          style={{ borderRadius: radius }}
        >
          <span className="rounded-full bg-ink px-3 py-1.5 text-[12px] font-medium text-page shadow-soft">
            Drop to add
          </span>
        </span>
      )}
    </div>
  )
}
