import type { ReactNode } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Side-nav primitives — styleguide §7.2 / §7.3, encoded once
// ---------------------------------------------------------------------------
//
// Every row in both panels comes from here, for the reason `index.css` owns the
// type scale rather than eight routes restating `text-2xl font-semibold`: a nav
// whose active state is spelled out at each call site drifts, and the active
// state is the one thing the sidebar exists to tell you.
//
// §7.2 in full, because it is short and this is the only place it is honoured:
// items are 14px/400 secondary ink, ~8px of vertical padding, an 8px radius hit
// area; **active is a `--surface-selected` fill with primary ink at weight 500**,
// and there is no accent left-bar — the tinted fill carries it, which is also
// what keeps the accent budget (§4) spent on primary actions rather than on
// wherever you happen to be standing.

/**
 * A group of rows under an uppercase eyebrow.
 *
 * **The eyebrow is the product's one uppercase string** (§7.3: 11px/500,
 * `0.06em`, tertiary grey — never accent). Everything else in BrandFactory is
 * sentence case, and `MiniAppTile` carries a comment saying so *because this
 * component did not exist yet*; that comment is updated in the same pass.
 *
 * `label` is optional: the first group of a panel is the scope's own home and
 * needs no heading over one row. `<nav>` + `aria-label` rather than a bare
 * `<ul>`, so a screen reader can jump between the groups.
 */
export function NavGroup({
  label,
  children,
  className,
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <nav aria-label={label} className={cn('flex flex-col gap-0.5', className)}>
      {label && (
        <div className="px-2.5 pt-4 pb-1.5 text-[11px] leading-none font-medium tracking-[0.06em] text-tertiary uppercase">
          {label}
        </div>
      )}
      {children}
    </nav>
  )
}

export interface NavItemProps {
  /**
   * Where the row goes, as the router's own props.
   *
   * A `to` + `params` pair rather than a formatted string: TanStack's `Link` is
   * type-safe over the route tree, and a component that took `href: string`
   * would launder every typo in this app's navigation past the compiler — which
   * is precisely the class of dead affordance the hub spent 1.7.0 removing.
   */
  link: LinkProps
  label: string
  icon?: LucideIcon
  active?: boolean
  /**
   * The right-hand count.
   *
   * **`null` and `undefined` are both silence, and they mean different things.**
   * `undefined` is a row that does not count anything; `null` is a row whose
   * count is *not known yet* — the query is pending or it failed. Neither may
   * render `0`, for the reason the hub tiles never did: a nav that claims a
   * brand has no threads while the request is still in flight is wrong in the
   * one direction that makes people stop looking.
   */
  count?: number | null
  /** A right-hand word instead of a count — `Soon` on a not-yet-live app. */
  badge?: string
  /** `1` indents the row as a child of the one above (a thread under its app). */
  depth?: 0 | 1
  /**
   * The page on screen is one of this row's children, not the row itself.
   *
   * Primary ink, no fill: the fill stays on the child that actually carries
   * `aria-current`, and this keeps the parent from reading as unrelated to the
   * lit row hanging under it. Purely visual — the child owns the state.
   */
  childActive?: boolean
}

export function NavItem({
  link,
  label,
  icon: Icon,
  active = false,
  count,
  badge,
  depth = 0,
  childActive = false,
}: NavItemProps) {
  return (
    <Link
      {...link}
      // `aria-current="page"` is the state; the fill is the picture of it.
      // Styling alone would leave "where am I" visible to sighted users only —
      // the same defect the switchers fixed with `menuitemradio`.
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-2.5 text-sm transition-colors duration-150',
        // A child row is a smaller pill hanging under its parent's label, not a
        // full-width row with more left padding: the margin is what makes the
        // nesting visible. `pl-3` lands the text at 36px — exactly where a
        // top-level label sits after its icon — so children align with the
        // parent's text while the pill edge shows the hierarchy.
        depth === 1 ? 'ml-6 rounded-md py-1.5 pr-2.5 pl-3' : 'rounded-lg px-2.5 py-2',
        active
          ? 'bg-surface-selected font-medium text-foreground'
          : childActive
            ? 'text-foreground hover:bg-accent'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {badge}
        </span>
      ) : typeof count === 'number' ? (
        // Tabular by inheritance (`index.css` §5.3 covers `[data-numeric]`), so
        // a column of counts lines up and does not jitter when one refetches.
        <span data-numeric className="shrink-0 text-xs text-muted-foreground">
          {count}
        </span>
      ) : null}
    </Link>
  )
}

/**
 * A row that acts instead of navigating — `New brand…` at the foot of a list.
 *
 * Same geometry as `NavItem` and deliberately never `active`: an action has no
 * "you are here" state, and giving it one would make the fill mean two things.
 */
export function NavAction({
  label,
  icon: Icon,
  onClick,
  disabled = false,
}: {
  label: string
  icon?: LucideIcon
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150',
        disabled
          ? 'cursor-not-allowed text-[var(--color-text-disabled)]'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}
