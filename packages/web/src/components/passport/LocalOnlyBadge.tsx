import { usePassportLinkage } from '@/components/passport/linkage'
import { cn } from '@/lib/utils'

/**
 * "Local only" — this brand exists in BrandFactory and nowhere else.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 8f.
 * Decision: proposal §8 `D1-b`.
 *
 * ---------------------------------------------------------------------------
 * A STATE, not an error
 * ---------------------------------------------------------------------------
 *
 * `D1-b` exists so that a person can create a brand while Mission Passport is unreachable
 * and keep working in it. So an unlinked brand is the feature behaving correctly, and it must
 * not wear error styling, an alert icon or a warning colour. It is muted, small, and sits
 * beside the name.
 *
 * What it *must* do is stop an unlinked brand looking identical to a linked one. Two things
 * are true of it that are true of nothing else in the app: **no sibling Mission Systems app
 * can see it**, and — until an Admin promotes it — it is visible to the whole organisation
 * rather than to the people holding a role at it. Neither is discoverable from anywhere else
 * in the UI.
 *
 * ---------------------------------------------------------------------------
 * The gate lives in `./linkage`, and it is the whole design
 * ---------------------------------------------------------------------------
 *
 * The badge is silent unless the workspace is a Passport organisation, because otherwise it
 * would render on every brand in every deployment that has no Passport at all. `usePassportLinkage`
 * carries the reasoning; read it before making this render unconditionally.
 *
 * No caller can forget the gate, because the caller never applies it — this component does.
 * Surfaces pass the brand's own flag and nothing else.
 */
export function LocalOnlyBadge({
  linked,
  className,
}: {
  /** The brand's `linkedToPassport`. */
  linked: boolean
  className?: string
}) {
  const meaningful = usePassportLinkage()

  if (linked) return null
  // The gate. See `./linkage` — without it this renders on every brand in every deployment
  // that has no Passport at all.
  if (!meaningful) return null

  return (
    <span
      className={cn(
        'shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] leading-none font-medium text-muted-foreground',
        className,
      )}
      // Not `role="status"`: this is a standing property of the row, not something that just
      // happened, and announcing it on every list render would be noise in a screen reader.
      title="This brand exists only in BrandFactory. Other Mission Systems apps cannot see it until an administrator adds it to Mission Passport."
    >
      Local only
    </span>
  )
}
