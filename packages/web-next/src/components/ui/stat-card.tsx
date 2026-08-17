import type { LucideIcon } from "lucide-react"
import { TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Metric / stat card — styleguide §12.1, and the piece the accent budget is written around.
 *
 * `tone="accent"` is the hero: the single most important number on the screen, accent-filled,
 * white text, hero type size. **At most one per view** (§4) — a second accent-filled card
 * means the hierarchy is wrong, not that the view is important.
 *
 * `tone="warning"` takes the whole card into ochre — number, icon, bullet and caption
 * together — because a state signalled by colour alone fails WCAG 1.4.1. The caption is the
 * part that actually says what to do about it ("below par — reorder soon"), and it is
 * required for that reason.
 */
export function StatCard({
  label,
  value,
  prefix,
  caption,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string
  /** Pre-formatted. Formatting is a caller decision; alignment is not — this is tabular. */
  value: string | number
  /** Currency or unit prefix, rendered at ~0.55em and baseline-aligned (§5.3). */
  prefix?: string
  caption?: string
  icon?: LucideIcon
  tone?: "default" | "accent" | "warning"
  className?: string
}) {
  const isAccent = tone === "accent"
  const isWarning = tone === "warning"
  const ToneIcon = Icon ?? (isWarning ? TriangleAlertIcon : undefined)

  return (
    <div
      data-slot="stat-card"
      data-tone={tone}
      // `data-surface="accent"` is what switches the focus ring to white inside a dark fill
      // (globals.css §10.2).
      data-surface={isAccent ? "accent" : undefined}
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-5 shadow-e1",
        isAccent
          ? "border-transparent bg-surface-accent text-ink-inverse"
          : "border-border bg-card text-ink",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "text-helper",
            isAccent ? "text-ink-inverse/80" : isWarning ? "text-warning" : "text-ink-secondary"
          )}
        >
          {label}
        </span>
        {ToneIcon ? (
          <ToneIcon
            aria-hidden
            className={cn(
              "size-4 shrink-0",
              isAccent
                ? "text-ink-inverse/70"
                : isWarning
                  ? "text-warning"
                  : "text-ink-tertiary"
            )}
          />
        ) : null}
      </div>

      <p
        data-numeric
        className={cn(
          isAccent ? "text-metric-hero" : "text-metric",
          isWarning && "text-warning"
        )}
      >
        {prefix ? (
          <span className="align-baseline text-[0.55em]">{prefix}</span>
        ) : null}
        {value}
      </p>

      {caption ? (
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-4xl",
              isAccent
                ? "bg-ink-inverse/70"
                : isWarning
                  ? "bg-warning"
                  : "bg-ink-tertiary"
            )}
          />
          <span
            className={cn(
              "text-helper",
              isAccent ? "text-ink-inverse/80" : isWarning ? "text-warning" : "text-ink-secondary"
            )}
          >
            {caption}
          </span>
        </div>
      ) : null}
    </div>
  )
}
