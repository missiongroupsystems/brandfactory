'use client'

import * as React from 'react'

/**
 * Stops the browser's own drag of a photo: the ghost image that takes over a press meant to pan a
 * crop. A photo inside something the app made draggable (a calendar tile, an idea's reference)
 * still moves with it. The CSS rule on `img` does this in Chrome and Safari; this covers Firefox.
 */
export function stopImageDrag(e: DragEvent) {
  const target = e.target
  if (target instanceof HTMLImageElement && !target.closest('[draggable="true"]'))
    e.preventDefault()
}

export function NoImageDrag() {
  React.useEffect(() => {
    document.addEventListener('dragstart', stopImageDrag, true)
    return () => document.removeEventListener('dragstart', stopImageDrag, true)
  }, [])
  return null
}
