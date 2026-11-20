'use client'

/**
 * The accounts a brand's team picked last, as a collaborator or a tag, newest first: what the
 * post page's people fields offer first. A post's own collaborators and tags are not kept in the
 * brand's state, so this list is the browser's, per brand; a private window starts with none.
 */

const KEY = 'brandbase.people-used'
const MAX = 30

let memory: Record<string, string[]> = {}

function readAll(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) memory = JSON.parse(raw) as Record<string, string[]>
  } catch {
    // No storage: the list lasts as long as the page.
  }
  return memory
}

const fold = (handle: string) => handle.replace(/^@+/, '').toLowerCase()

/** The handles picked for this brand, newest first, each once, without "@". */
export function recentOf(brandId: string): string[] {
  return readAll()[brandId] ?? []
}

/** Puts a handle first in the brand's list. */
export function noteUsed(brandId: string, handle: string) {
  const h = fold(handle)
  if (!h) return
  const all = readAll()
  memory = { ...all, [brandId]: [h, ...(all[brandId] ?? []).filter((x) => x !== h)].slice(0, MAX) }
  try {
    localStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    // As above.
  }
}

/** Empties every brand's list, for the tests. */
export function resetRecent() {
  memory = {}
  try {
    localStorage.removeItem(KEY)
  } catch {
    // As above.
  }
}
