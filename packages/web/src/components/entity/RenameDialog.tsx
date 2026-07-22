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

export type RenameResource = 'workspace' | 'brand' | 'project'

export interface RenameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resource: RenameResource
  initialName: string
  /** Brand only. */
  initialDescription?: string | null
  pending?: boolean
  onSubmit: (values: { name: string; description?: string | null }) => void
}

const TITLES: Record<RenameResource, string> = {
  workspace: 'Rename workspace',
  brand: 'Rename brand',
  project: 'Rename project',
}

/** Form body remounts when the dialog opens so fields re-seed from props. */
function RenameForm({
  resource,
  initialName,
  initialDescription,
  pending,
  onSubmit,
  onCancel,
}: {
  resource: RenameResource
  initialName: string
  initialDescription: string | null
  pending: boolean
  onSubmit: RenameDialogProps['onSubmit']
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')
  const canSubmit = name.trim().length > 0 && !pending

  return (
    <>
      <form
        id="rename-entity-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSubmit) return
          if (resource === 'brand') {
            onSubmit({
              name: name.trim(),
              description: description.trim() ? description.trim() : null,
            })
          } else {
            onSubmit({ name: name.trim() })
          }
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rename-name">Name</Label>
          <Input id="rename-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {resource === 'brand' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-description">Description (optional)</Label>
            <Input
              id="rename-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this brand is about"
            />
          </div>
        )}
      </form>
      <DialogFooter>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form="rename-entity-form" disabled={!canSubmit}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  )
}

export function RenameDialog({
  open,
  onOpenChange,
  resource,
  initialName,
  initialDescription = null,
  pending = false,
  onSubmit,
}: RenameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{TITLES[resource]}</DialogTitle>
        </DialogHeader>
        {/* The conditional mount is what re-seeds the form: closing unmounts it,
            so reopening always picks up the current name/description. Keying on
            `initialName`/`initialDescription` as well would remount mid-edit
            whenever a background refetch changed the entity, silently throwing
            away what the user had typed. */}
        {open ? (
          <RenameForm
            resource={resource}
            initialName={initialName}
            initialDescription={initialDescription}
            pending={pending}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
