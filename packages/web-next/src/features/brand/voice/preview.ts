import type { BrandId } from '@/data/brands'

import type { Voice } from '../kit-parts'

/**
 * What AI would write in a voice, simulated: the demo has no model. Each brand has three plain
 * drafts (a caption, a hook, a reply) written with the words its voice avoids; a voice rewrites
 * a draft by putting each pair's Say word where its Not word was. Two voices side by side show
 * what a change to the voice changes in what AI writes.
 */

export type SampleKind = 'Caption' | 'Hook' | 'Reply'

export const SAMPLES: Record<BrandId, Record<SampleKind, string>> = {
  'casa-vostra': {
    Caption:
      'Tagliatelle, artisanal. A crust that’s authentic, ten seconds in the fire. Handcrafted at Raffles City, so indulge.',
    Hook: 'Authentic pizza, ten seconds of fire.',
    Reply: 'Thank you! Next time, indulge: the tagliatelle is artisanal.',
  },
  temper: {
    Caption:
      'Organic vino from a grower in Jura, on tap until it runs out. Pour a drink and chill vibes.',
    Hook: 'Organic vino, in one sip.',
    Reply: 'Thanks for coming! Next time, a drink at the bar and chill vibes.',
  },
  carlitos: {
    Caption:
      'Small plates the way Madrid does them, at the concept in Joo Chiat. Sample the ham, order two.',
    Hook: 'Small plates, loud Madrid.',
    Reply: 'Gracias! Come back and sample the ham, it is still on the bone.',
  },
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The draft as the voice writes it: every Not word becomes its Say word, in one pass. */
export function written(draft: string, voice: Voice): string {
  const pairs = voice.words
    .map((w) => ({ use: w.use.trim(), avoid: w.avoid.trim() }))
    .filter((w) => w.use && w.avoid)
    // The longer phrase first, so "organic vino" wins over "vino".
    .sort((a, b) => b.avoid.length - a.avoid.length)
  if (pairs.length === 0) return draft
  const swap = new Map(pairs.map((p) => [p.avoid.toLowerCase(), p.use]))
  const pattern = new RegExp(`\\b(${pairs.map((p) => escape(p.avoid)).join('|')})\\b`, 'gi')
  return draft.replace(pattern, (match) => {
    const use = swap.get(match.toLowerCase()) ?? match
    // A word at the start of a sentence keeps its capital.
    return match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()
      ? use.charAt(0).toUpperCase() + use.slice(1)
      : use
  })
}

export interface Piece {
  text: string
  /** True for a word one side has and the other does not. */
  changed: boolean
}

/**
 * Two lines word by word (a longest common run): each side's words, marked where they differ.
 * The lines are a sentence or two, so the square table is small.
 */
export function diffWords(before: string, after: string): { before: Piece[]; after: Piece[] } {
  const a = before.split(/(\s+)/)
  const b = after.split(/(\s+)/)
  const run = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      run[i][j] = a[i] === b[j] ? run[i + 1][j + 1] + 1 : Math.max(run[i + 1][j], run[i][j + 1])
  const left: Piece[] = []
  const right: Piece[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      left.push({ text: a[i++], changed: false })
      right.push({ text: b[j++], changed: false })
    } else if (j < b.length && (i === a.length || run[i][j + 1] >= run[i + 1][j])) {
      right.push({ text: b[j], changed: /\S/.test(b[j++]) })
    } else {
      left.push({ text: a[i], changed: /\S/.test(a[i++]) })
    }
  }
  return { before: runs(left), after: runs(right) }
}

/** A changed phrase reads as one mark: the spaces inside it join it, and neighbours merge. */
function runs(pieces: Piece[]): Piece[] {
  const out: Piece[] = []
  pieces.forEach((p, i) => {
    const inside = !/\S/.test(p.text) && pieces[i - 1]?.changed && pieces[i + 1]?.changed
    const changed = p.changed || Boolean(inside)
    const last = out.at(-1)
    if (last && last.changed === changed) last.text += p.text
    else out.push({ text: p.text, changed })
  })
  return out
}

/** What changes between two voices, one plain line each, for a review before it goes live. */
export function changesBetween(old: Voice, next: Voice): string[] {
  const out: string[] = []
  if (old.summary.trim() !== next.summary.trim()) out.push('New summary')
  const key = (w: Voice['words'][number]) => `${w.use.trim()}|${w.avoid.trim()}`
  const had = new Set(old.words.map(key))
  const has = new Set(next.words.map(key))
  const gone = old.words.filter((w) => !has.has(key(w)))
  for (const w of next.words) {
    if (had.has(key(w))) continue
    // A pair that kept one of its words reads as an edit of that pair, not a new one.
    const was = gone.findIndex((g) => g.avoid === w.avoid || g.use === w.use)
    if (was === -1) {
      out.push(`Say “${w.use}”, not “${w.avoid}”`)
      continue
    }
    const [g] = gone.splice(was, 1)
    out.push(
      g.avoid === w.avoid ? `“${g.use}” → “${w.use}”` : `Not “${g.avoid}” → not “${w.avoid}”`,
    )
  }
  for (const g of gone) out.push(`No longer “${g.use}” for “${g.avoid}”`)
  const added = next.examples.filter((l) => !old.examples.includes(l)).length
  const dropped = old.examples.filter((l) => !next.examples.includes(l)).length
  if (added)
    out.push(added === 1 ? 'A new line it sounds like' : `${added} new lines it sounds like`)
  if (dropped) out.push(dropped === 1 ? 'A line taken out' : `${dropped} lines taken out`)
  return out
}
