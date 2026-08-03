// Whether the contextual panel is folded away, remembered across sessions.
//
// Same shape and the same swallowed failure as `last-workspace`: a private
// browsing window that blocks `localStorage` gets the default rather than a
// crash, and the default is *open* — a nav that hides itself because storage is
// unavailable is a worse first impression than one that ignores a preference
// nobody could save.
//
// Only the panel is foldable. The rail is 56px of monograms that no screen
// needs back, and a shell whose entire navigation can be dismissed on a desktop
// is one keystroke away from a user who cannot find their way out.

const KEY = 'bf_nav_panel_collapsed'

export function getPanelCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setPanelCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0')
  } catch {
    // ignore (private browsing may block localStorage writes)
  }
}
