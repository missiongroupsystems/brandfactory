'use client'

import * as React from 'react'

const PHONE = '(max-width: 767px)'
const onPhone = (cb: () => void) => {
  const mq = window.matchMedia(PHONE)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/**
 * Below 768px the page is the phone layout (`max-md:`): what opens there is a sheet, not a dialog
 * or a panel. False on the server, so the first paint is the desktop's.
 */
export function usePhone(): boolean {
  return React.useSyncExternalStore(
    onPhone,
    () => window.matchMedia(PHONE).matches,
    () => false,
  )
}
