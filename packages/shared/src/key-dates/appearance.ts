import { type KeyDateSet } from './types'

// ---------------------------------------------------------------------------
// appearance — the one place a key-date set's colour is spelled
// ---------------------------------------------------------------------------
//
// A set's colour is used identically on five surfaces: the marker in a day
// cell, the season band above the grid, the row in the list's Key dates block,
// the dot beside a day heading, and the swatch beside its checkbox in the menu.
// That consistency is the whole point — the colour is only useful if it is
// learnable, and it is only learnable if the menu that switches a set on shows
// the same swatch the calendar paints. Five surfaces reading five literals is
// how that stops being true, which is what 1.22.1 §2 had to go back and fix for
// a shelf name.
//
// **Colour is never the only signal.** Three tinted labels are indistinguishable
// to a reader with deuteranopia and invisible to a screen reader, so every
// surface that uses this map also carries the set in text: the marker's
// accessible name includes it, the list block groups under a named heading, and
// the menu row pairs each swatch with its label. This is measured, not assumed —
// under simulated protanopia the rose and teal inks sit at ΔE 8.4, which is
// barely separable. The colour is the fast path, never the only path.

/**
 * Complete Tailwind class strings per set. **Never composed at the call site.**
 *
 * `bg-keydate-${set}-tint` would type-check, read fine, and produce no CSS:
 * Tailwind scans source text for whole class names, so an interpolated one is
 * never generated. The failure is silent — a colourless pill, not a build
 * error — which is why the full string is written out six times here and the
 * call sites only ever index this map.
 *
 * The keys are `Record<KeyDateSet, …>`, so a fourth set is a type error rather
 * than a row that renders uncoloured.
 */
export const KEY_DATE_APPEARANCE: Record<KeyDateSet, { label: string; dot: string }> = {
  global: {
    label: 'bg-keydate-global-tint text-keydate-global',
    dot: 'bg-keydate-global',
  },
  'sg-holidays': {
    label: 'bg-keydate-sg-holidays-tint text-keydate-sg-holidays',
    dot: 'bg-keydate-sg-holidays',
  },
  'sg-events': {
    label: 'bg-keydate-sg-events-tint text-keydate-sg-events',
    dot: 'bg-keydate-sg-events',
  },
}
