import { useState } from 'react'
import { toast } from 'sonner'
import { useStructurePermission, useWorkspaceDrift, usePromoteBrand } from '@/api/queries/passport'
import { Button } from '@/components/ui/button'
import { PromoteBrandDialog } from '@/components/passport/PromoteBrandDialog'

/**
 * The drift view — an Admin's picture of where this workspace and Mission Passport disagree.
 *
 * Plan: phase 9e. Decision: proposal §8 `D1-b`.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ TWO sections, and merging them is the failure
 * ---------------------------------------------------------------------------
 *
 * **"Not in Passport" needs somebody.** These brands exist here and nowhere else. No sibling
 * app can see them, and until they are promoted they are visible to the whole organisation
 * rather than to the people holding a role at them.
 *
 * **"Different name in Passport" needs nobody.** Under `D1-b` the display label and the legal
 * name mean different things and may differ for ever — `Casa Vostra` against
 * `Casa Vostra Pte. Ltd.` is the design working. It is listed so that a rename in the Passport
 * console is *visible*, since our label deliberately does not follow it.
 *
 * One merged list would put dozens of permanent, correct rows in front of the two that need
 * an Admin. That is how a drift screen becomes a screen nobody opens — and the rows that
 * mattered were the ones it existed for.
 *
 * ---------------------------------------------------------------------------
 * It renders nothing at all unless you can act on it
 * ---------------------------------------------------------------------------
 *
 * Gated on `/passport/structure/me`, which is the same gate the writes use. Not for secrecy —
 * the server refuses regardless — but because a panel of things you cannot change, on a
 * deployment that may have no Passport at all, is noise on everybody else's settings page.
 */
export function StructureDriftPanel({ workspaceId }: { workspaceId: string }) {
  const { data: permission } = useStructurePermission()
  const canWrite = permission?.canWriteStructure === true
  const { data: drift, isLoading } = useWorkspaceDrift(workspaceId, canWrite)
  const promote = usePromoteBrand(workspaceId)
  const [confirming, setConfirming] = useState<{ id: string; name: string } | null>(null)

  if (!canWrite) return null
  if (isLoading || !drift) return null
  if (drift.unlinked.length === 0 && drift.diverged.length === 0) return null

  const onConfirm = () => {
    if (!confirming) return
    promote.mutate(confirming.id, {
      onSuccess: (result) => {
        setConfirming(null)
        // `pending`, always: the LINK arrives by event a moment later, so claiming it is done
        // would be wrong for about a second and the row would then "correct" itself in a way
        // that reads as a bug.
        toast.success(
          result.warning ??
            `“${confirming.name}” is being added to Mission Passport. It will appear shortly.`,
        )
      },
      onError: (err: unknown) => {
        // Surfaced verbatim. The server's messages here are the ones a person can act on —
        // "only an Owner or Admin", "sign in with your Passport account", "temporarily
        // read-only" — and replacing them with a generic failure discards the whole point of
        // mapping Passport's statuses.
        setConfirming(null)
        toast.error(err instanceof Error ? err.message : 'Could not add the brand.')
      },
    })
  }

  return (
    <section className="space-y-6">
      {drift.unlinked.length > 0 ? (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">Not in Mission Passport</h3>
            <p className="text-sm text-muted-foreground">
              These brands exist only in BrandFactory. No other Mission Systems app can see them.
            </p>
          </div>
          <ul className="divide-y rounded-lg border">
            {drift.unlinked.map((b) => (
              <li key={b.brandId} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-sm">{b.displayName}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={promote.isPending}
                  onClick={() => setConfirming({ id: b.brandId, name: b.displayName })}
                >
                  Add to Passport
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {drift.diverged.length > 0 ? (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">Different name in Mission Passport</h3>
            {/* Says "expected" in as many words. Without it this reads as a list of faults,
                and somebody spends an afternoon "fixing" thirty rows that are correct. */}
            <p className="text-sm text-muted-foreground">
              Expected. BrandFactory shows a short label; Passport holds the legal name. Listed here
              so a rename in the Passport console is visible.
            </p>
          </div>
          <ul className="divide-y rounded-lg border">
            {drift.diverged.map((b) => (
              <li key={b.brandId} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-sm">{b.displayName}</span>
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {b.legalName}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PromoteBrandDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        brandName={confirming?.name ?? ''}
        pending={promote.isPending}
        onConfirm={onConfirm}
      />
    </section>
  )
}
