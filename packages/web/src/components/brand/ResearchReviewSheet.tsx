import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { ResearchDraft } from '@brandfactory/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ---------------------------------------------------------------------------
// ResearchReviewSheet — E2, the path every re-run on a curated brand takes
// ---------------------------------------------------------------------------
//
// One card per draft, its sources visible, a checkbox each, and **Accept
// selected**, which stages them into the ordinary editor and gets out of the
// way. Nothing here writes: the guidelines have exactly one writer
// (`PATCH /brands/:id/guidelines`), and routing acceptance through the editor
// is what keeps it that way — you end up in the surface with ordinary undo and
// an ordinary Save rather than in a second one that has to be kept honest.
//
// **Sources are not decoration.** Research decision 4 exists because a cited,
// confident, entirely wrong brand profile is the failure mode of this feature;
// citations make a result *look* more trustworthy, not less. So every card puts
// its sources where the decision to accept is made, not one click away.
//
// Called a sheet because that is the name the locked document gives it. It is
// built on `Dialog`: `components/ui` has no sheet primitive, and adding one for
// a surface that may not survive review would be the mockup deciding something
// it was built to ask about.

export interface ResearchReviewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  drafts: ResearchDraft[]
  /** Selected drafts, in the order they were presented. */
  onAcceptSelected: (drafts: ResearchDraft[]) => void
}

export function ResearchReviewSheet({
  open,
  onOpenChange,
  drafts,
  onAcceptSelected,
}: ResearchReviewSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review research drafts</DialogTitle>
          <DialogDescription>
            Nothing is saved until you accept. Accepting opens the editor with the drafts staged.
          </DialogDescription>
        </DialogHeader>

        {/* The tick state lives one level down, inside the portal, because
            `DialogContent` unmounts when closed — so reopening after a re-run
            starts fresh by construction rather than by an effect that resets it
            on `open`. */}
        <ReviewBody
          drafts={drafts}
          onAcceptSelected={onAcceptSelected}
          onDismiss={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function ReviewBody({
  drafts,
  onAcceptSelected,
  onDismiss,
}: {
  drafts: ResearchDraft[]
  onAcceptSelected: (drafts: ResearchDraft[]) => void
  onDismiss: () => void
}) {
  // Everything selected on arrival. The sheet's job is review, not data entry:
  // the common case is "these look right, take them", and starting at zero
  // would make the ordinary path five clicks longer than the exceptional one.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(drafts.map((d) => d.label)))
  const chosen = drafts.filter((d) => selected.has(d.label))

  return (
    <>
      <ul className="flex flex-col gap-3">
        {drafts.map((d, i) => {
          const inputId = `research-draft-${i}`
          return (
            <li key={d.label} className="rounded-xl border bg-card p-4 shadow-elevation-1">
              <div className="flex items-start gap-3">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={selected.has(d.label)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (next.has(d.label)) next.delete(d.label)
                      else next.add(d.label)
                      return next
                    })
                  }
                  // §12.5 — a selected control is the accent's named role, and
                  // one of the few places on this page it is allowed to spend.
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <label htmlFor={inputId} className="block cursor-pointer font-medium">
                    {d.label}
                  </label>
                  <p className="mt-1.5 text-sm text-muted-foreground">{d.text}</p>
                </div>
              </div>

              <ul className="mt-3 flex flex-col gap-1 border-t pt-3">
                {d.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      // §3.1 — a standalone link reads `--color-text-link`.
                      className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-link)] hover:underline"
                    >
                      {s.title}
                      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>

      <DialogFooter>
        <Button variant="outline" type="button" onClick={onDismiss}>
          Not now
        </Button>
        <Button
          type="button"
          disabled={chosen.length === 0}
          onClick={() => onAcceptSelected(chosen)}
        >
          Accept selected ({chosen.length})
        </Button>
      </DialogFooter>
    </>
  )
}
