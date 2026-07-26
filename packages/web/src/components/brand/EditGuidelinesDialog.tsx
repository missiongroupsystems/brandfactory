import type { BrandWithSections } from '@brandfactory/shared'
import { BrandGuidelinesEditor } from '@/components/brand/BrandGuidelinesEditor'
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
}

// Frames the guidelines editor in a dialog. The editor already owns its own
// Save button and Cmd-S handler, so this wrapper does NOT duplicate the save
// path — the footer is just a close affordance. `key={brand.id}` preserves the
// remount-on-brand-switch idiom the editor's local-state seeding depends on.
export function EditGuidelinesDialog({ brand, open, onOpenChange }: EditGuidelinesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>Edit brand context</DialogTitle>
        </DialogHeader>
        <BrandGuidelinesEditor key={brand.id} brand={brand} />
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
