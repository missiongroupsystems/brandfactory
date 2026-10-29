/** Three small dots that rise in turn: something is on its way. `label` names it for a reader. */
export function LoadingDots({ label, className = '' }: { label: string; className?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`flex items-center justify-center gap-[5px] ${className}`}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bb-bounce size-[5px] rounded-full bg-ink-3"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  )
}
