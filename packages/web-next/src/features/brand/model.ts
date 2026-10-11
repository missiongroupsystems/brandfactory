import type { BrandFile, BrandKit, FileKind } from '@/data/brand-kit'

/**
 * The rules of a brand's file list. The title is what AI reads to know what a file is about, so
 * it is the team's to set: an upload starts with a plain one made from its name, a new version
 * keeps it, and a blank rename never wipes it.
 */

const KIND_BY_EXT: Record<string, FileKind> = {
  pdf: 'pdf',
  ppt: 'deck',
  pptx: 'deck',
  key: 'deck',
  doc: 'doc',
  docx: 'doc',
  txt: 'doc',
  md: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  svg: 'image',
}

export function kindOf(name: string): FileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return KIND_BY_EXT[ext] ?? 'doc'
}

/** "CV_brand-deck_2025.pdf" → "CV brand deck 2025": a start the team can rename. */
export function plainTitle(name: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  const words = base
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}

export function uploaded(files: BrandFile[], name: string, id: string): BrandFile[] {
  return [{ id, title: plainTitle(name), kind: kindOf(name), name, updated: 'Today' }, ...files]
}

/** A blank title keeps the old one: a file AI cannot name is a file it cannot use. */
export function renamed(files: BrandFile[], id: string, title: string): BrandFile[] {
  const t = title.trim()
  if (!t) return files
  return files.map((f) => (f.id === id ? { ...f, title: t } : f))
}

/** A new version of a file: the team's title stays, the file and its date change. */
export function replaced(files: BrandFile[], id: string, name: string): BrandFile[] {
  return files.map((f) => (f.id === id ? { ...f, name, kind: kindOf(name), updated: 'Today' } : f))
}

export function removed(files: BrandFile[], id: string): BrandFile[] {
  return files.filter((f) => f.id !== id)
}

type Voice = BrandKit['voice']
type Colour = BrandKit['colours'][number]

/**
 * The voice as the team left it after an edit. AI reads every part of it, so nothing half-done
 * gets through: a blank summary keeps the old one, a pair needs both its words, and a blank line
 * is dropped.
 */
export function voiceEdited(old: Voice, draft: Voice): Voice {
  const summary = draft.summary.trim() || old.summary
  const words = draft.words
    .map((w) => ({ use: w.use.trim(), avoid: w.avoid.trim() }))
    .filter((w) => w.use && w.avoid)
  const examples = draft.examples.map((l) => l.trim()).filter(Boolean)
  return { summary, words, examples }
}

/** "#d9572b", "d9572b" or "#d52" as "#D9572B"; anything else is null, so a typo is never saved. */
export function hexOf(input: string): string | null {
  const h = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) return `#${[...h].map((c) => c + c).join('')}`.toUpperCase()
  if (/^[0-9a-f]{6}$/i.test(h)) return `#${h}`.toUpperCase()
  return null
}

/** Colours as the team left them: a colour keeps a name, since the name is what people say. */
export function coloursEdited(draft: Colour[]): Colour[] {
  return draft.map((c) => ({ name: c.name.trim() || 'Untitled', hex: c.hex }))
}
