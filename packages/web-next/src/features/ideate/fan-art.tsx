/**
 * The four cards fanned above "Bring in your moodboard" before a brand brings its own boards in:
 * the logo's two shapes, a ring and a filled dot, played four ways in the calendar's own
 * colours. Drawn, not photographed, so no brand shows another's food, and a new brand has them
 * from the start.
 */
const CARDS = [
  // Ochre dot rising out of a terracotta ring: the mark itself, large.
  <>
    <rect width="100" height="132" fill="var(--layer-holiday)" />
    <circle cx="33" cy="82" r="24" fill="none" stroke="var(--confetti-1)" strokeWidth="7" />
    <circle cx="56" cy="52" r="15" fill="var(--confetti-4)" />
  </>,
  // Three green arches, one inside the next, with an ink dot over them.
  <>
    <rect width="100" height="132" fill="var(--layer-ours)" />
    {[32, 22, 12].map((r, i) => (
      <path
        key={r}
        d={`M ${38 - r} 132 V ${104 - r * 0.15} A ${r} ${r} 0 0 1 ${38 + r} ${104 - r * 0.15} V 132`}
        fill="none"
        stroke="var(--confetti-2)"
        strokeOpacity={1 - i * 0.25}
        strokeWidth="6"
      />
    ))}
    <circle cx="38" cy="34" r="7" fill="var(--ink)" />
  </>,
  // A blue ring with a dot on its orbit.
  <>
    <rect width="100" height="132" fill="var(--layer-city)" />
    <circle cx="36" cy="68" r="25" fill="none" stroke="var(--confetti-3)" strokeWidth="2.5" />
    <circle cx="36" cy="68" r="11" fill="var(--confetti-3)" fillOpacity="0.28" />
    <circle cx="53.7" cy="50.3" r="7" fill="var(--confetti-3)" />
  </>,
  // A lavender sun setting behind a horizon, a small ink ring above it.
  <>
    <rect width="100" height="132" fill="var(--layer-shoot)" />
    <circle cx="50" cy="96" r="30" fill="var(--confetti-5)" fillOpacity="0.55" />
    <rect y="96" width="100" height="36" fill="var(--layer-shoot)" />
    <path d="M 12 96 H 88" stroke="var(--confetti-5)" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="66" cy="36" r="9" fill="none" stroke="var(--ink)" strokeWidth="3" />
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
