import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ---------------------------------------------------------------------------
// The create dialog, as research decision 1 draws it
// ---------------------------------------------------------------------------
//
// A **copy** of `NewBrandDialog`, not an extraction of it, and that is the whole
// point of where this file lives. The real dialog posts `CreateBrandInput`, and
// `website_url` is not on that schema — putting the field on the shipped dialog
// means a `shared` change and a migration, which is the first line of this
// pass's non-goals. So the field is reviewed here and the real dialog is
// untouched until research Phase A lands the column.
//
// What is being reviewed is the **hard gate** (research decision 4): no website,
// no research, with the reason shown rather than the control silently dead. A
// deep pass over the bare string "Casa Vostra" finds *a* Casa Vostra and writes
// a confident, cited, entirely wrong profile — citations make that look more
// trustworthy, not less.
//
// Deliberately absent: `Other sources`, `Market / region`, `Focus on`. Three
// text inputs asking you to prompt-engineer a research job are a smaller version
// of the same tax this feature removes.

export function DemoNewBrandDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [description, setDescription] = useState('')
  const [research, setResearch] = useState(false)

  const canResearch = website.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>New brand</DialogTitle>
        </DialogHeader>

        <form
          id="demo-new-brand-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            console.log('[demo] create brand', { name, website, description, research })
            onOpenChange(false)
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="demo-brand-name">Name</Label>
            <Input
              id="demo-brand-name"
              placeholder="Casa Vostra"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="demo-brand-website">Website (optional)</Label>
            <Input
              id="demo-brand-website"
              placeholder="https://casavostra.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="demo-brand-description">Description (optional)</Label>
            <Input
              id="demo-brand-description"
              placeholder="What this brand is about"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="rounded-xl border bg-card p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={research && canResearch}
                disabled={!canResearch}
                onChange={(e) => setResearch(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary disabled:cursor-not-allowed"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Research this brand</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Reads the public web, ~3–15 min. Runs in the background; the brand is created
                  either way.
                </span>
                {!canResearch && (
                  // Disabled *with a reason*, in the place the reason applies.
                  // A control that is dead and silent is a control the user
                  // reads as broken.
                  <span className="mt-1.5 block text-xs text-muted-foreground">
                    Needs a website — without one, research finds a different brand with the same
                    name and is confidently wrong about it.
                  </span>
                )}
              </span>
            </label>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="demo-new-brand-form" disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
