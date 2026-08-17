import { cn } from "@/lib/utils"

/**
 * Beige shimmer at the shape of the content it stands in for (§12.8). The pulse is disabled
 * under `prefers-reduced-motion` by the base layer in globals.css (§14), which leaves a
 * static block — still a legible placeholder, which is the point.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-surface-sunken", className)}
      {...props}
    />
  )
}

export { Skeleton }
