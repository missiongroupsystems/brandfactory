'use client'

import * as React from 'react'

const ITEM = '[role="menuitem"], [role="menuitemradio"]'

/**
 * An open menu under `root`: the focus goes to its checked item or its first, Up and Down step through the items
 * round the ends, Escape or a press outside closes it, and the focus goes back to the button that
 * opened it.
 */
export function useMenu(
  open: boolean,
  close: () => void,
  root: React.RefObject<HTMLElement | null>,
) {
  React.useEffect(() => {
    if (!open) return
    const node = root.current
    // Safari does not focus a button on a click: the opener is found, not taken from the focus.
    const opener = node?.querySelector<HTMLElement>('[aria-haspopup="menu"]')
    const items = () => [...(node?.querySelectorAll<HTMLElement>(ITEM) ?? [])]
    // A menu of choices starts on the one in use.
    ;(node?.querySelector<HTMLElement>('[aria-checked="true"]') ?? items()[0])?.focus()
    const away = (e: PointerEvent) => {
      if (!node?.contains(e.target as Node)) close()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close()
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const all = items()
      if (all.length === 0) return
      e.preventDefault()
      const at = all.indexOf(document.activeElement as HTMLElement)
      const step = e.key === 'ArrowDown' ? 1 : -1
      const next = at === -1 ? (step === 1 ? 0 : all.length - 1) : at + step
      all[(next + all.length) % all.length]!.focus()
    }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', key)
      // The item that had the focus is gone with the menu: the focus is back on the page itself.
      const at = document.activeElement
      if (!at || at === document.body || node?.contains(at)) opener?.focus()
    }
  }, [open, close, root])
}
