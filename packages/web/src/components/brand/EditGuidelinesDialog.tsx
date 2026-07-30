import type { BrandWithSections } from '@brandfactory/shared'
import { BrandGuidelinesEditor, type StagedSection } from '@/components/brand/BrandGuidelinesEditor'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface EditGuidelinesDialogProps {
  brand: BrandWithSections
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * A message captured from a thread whose right pane is the canvas, or the
   * drafts accepted from the research review sheet, on their way into new
   * sections. Passed straight through: this is the same prop, in the same
   * shape, that `BrandContextPane` hands the editor for the in-pane click path,
   * so every staging destination is one path rather than several that have to
   * agree.
   *
   * Widened to a list by Stage 3E, and this file is a **pure type
   * pass-through** — which is the good kind of coupling: widening the editor
   * without widening both forwarders does not compile.
   */
  staged?: StagedSection[] | null
  onStagedConsumed?: () => void
  /**
   * Forwarded to the editor. Another pure pass-through, for the same reason as
   * `staged` above — see `BrandGuidelinesEditorProps.onSaved` for what it is for.
   */
  onSaved?: () => void
}

// Frames the guidelines editor in a dialog. The editor already owns its own
// Save button and Cmd-S handler, so this wrapper does NOT duplicate the save
// path — the footer is just a close affordance. `key={brand.id}` preserves the
// remount-on-brand-switch idiom the editor's local-state seeding depends on.
export function EditGuidelinesDialog({
  brand,
  open,
  onOpenChange,
  staged,
  onStagedConsumed,
  onSaved,
}: EditGuidelinesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>Edit brand context</DialogTitle>
        </DialogHeader>
        <BrandGuidelinesEditor
          key={brand.id}
          brand={brand}
          staged={staged}
          onStagedConsumed={onStagedConsumed}
          onSaved={onSaved}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Done
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
