import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Confirm adding a local brand to Mission Passport.
 *
 * Plan: phase 9f. Decision: proposal §7.
 *
 * ---------------------------------------------------------------------------
 * It names the blast radius rather than asking "are you sure"
 * ---------------------------------------------------------------------------
 *
 * A generic confirmation trains people to click through it. What makes this one worth reading
 * is that the consequence is **outside this app**, which nothing else in BrandFactory can say:
 *
 * - the brand becomes visible to every other Mission Systems app in the suite;
 * - the name goes up as the unit's **legal** name, and sibling apps use that for statutory
 *   output;
 * - it cannot be undone from here — a unit is archived in the Passport console, not deleted.
 *
 * ---------------------------------------------------------------------------
 * No typed-name gate, deliberately
 * ---------------------------------------------------------------------------
 *
 * `DeleteBrandDialog` makes you type the name, because deletion is irreversible and cascades.
 * This is **additive**: it publishes a record rather than destroying one. Copying the gate
 * here would spend the strongest signal the app has on the milder action, and make the two
 * indistinguishable — which is how a typed-name gate stops meaning anything.
 *
 * The legal name is echoed instead, because that is the part somebody may actually want to
 * change first, and it is the one thing they cannot fix here afterwards without an Admin
 * going into the console.
 */
export interface PromoteBrandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandName: string
  pending?: boolean
  onConfirm: () => void
}

export function PromoteBrandDialog({
  open,
  onOpenChange,
  brandName,
  pending = false,
  onConfirm,
}: PromoteBrandDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add “{brandName}” to Mission Passport?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                This publishes the brand to Mission Passport. Other Mission Systems apps will be
                able to see it, and <strong>“{brandName}” becomes its legal name</strong> — which
                those apps use for statutory output.
              </p>
              <p>
                You cannot undo this from BrandFactory. A brand is removed from Passport in the
                Passport console, by archiving it.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className={cn(buttonVariants())}
            onClick={(e) => {
              // The dialog closes itself on action. Prevented, because the request is in
              // flight and the button has a pending state worth showing — closing first
              // leaves the person with no feedback until the list refetches.
              e.preventDefault()
              onConfirm()
            }}
          >
            {pending ? 'Adding…' : 'Add to Passport'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
