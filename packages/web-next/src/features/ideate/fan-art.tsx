/**
 * The four cards fanned above "Bring in your moodboard" before a brand brings its own boards in:
 * four bold shapes, one per card (a quarter circle, an arch, bands, a flower), each with the
 * logo's dot or ring, in the calendar's own colours. Drawn, not photographed, so no brand shows another's food, and a new brand has them
 * from the start.
 */
const CARDS = [
  // A terracotta quarter circle filling the corner, an ochre sun clear of it.
  <>
    <rect width="100" height="132" fill="var(--layer-holiday)" />
    <path d="M 0 132 V 50 A 82 82 0 0 1 82 132 Z" fill="var(--confetti-1)" />
    <circle cx="58" cy="34" r="15" fill="var(--confetti-4)" />
  </>,
  // A solid green arch, a doorway, with a small ink dot at its top.
  <>
    <rect width="100" height="132" fill="var(--layer-ours)" />
    <path d="M 6 132 V 74 A 32 32 0 0 1 70 74 V 132 Z" fill="var(--confetti-2)" />
    <circle cx="38" cy="26" r="7" fill="var(--ink)" />
  </>,
  // Three blue bands across, thick to thin, cut by a white disc.
  <>
    <rect width="100" height="132" fill="var(--layer-city)" />
    <rect y="30" width="100" height="22" fill="var(--confetti-3)" />
    <rect y="62" width="100" height="14" fill="var(--confetti-3)" fillOpacity="0.7" />
    <rect y="86" width="100" height="7" fill="var(--confetti-3)" fillOpacity="0.45" />
    <circle cx="34" cy="64" r="17" fill="var(--page)" />
  </>,
  // A lavender four-petal flower and an ink ring beside it.
  <>
    <rect width="100" height="132" fill="var(--layer-shoot)" />
    <g fill="var(--confetti-5)">
      <circle cx="50" cy="56" r="17" />
      <circle cx="50" cy="90" r="17" />
      <circle cx="33" cy="73" r="17" />
      <circle cx="67" cy="73" r="17" />
    </g>
    <circle cx="50" cy="73" r="7" fill="var(--layer-shoot)" />
    <circle cx="78" cy="26" r="8" fill="none" stroke="var(--ink)" strokeWidth="3" />
  </>,
]

export function FanArt({ index }: { index: number }) {
  return (
    <svg
      viewBox="0 0 100 132"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      {CARDS[index % CARDS.length]}
    </svg>
  )
}
