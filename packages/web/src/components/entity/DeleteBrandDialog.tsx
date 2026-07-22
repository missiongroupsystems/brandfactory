import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface DeleteBrandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandName: string
  /** `null` when the project count is unknown (still loading, or failed). */
  projectCount: number | null
  pending?: boolean
  onConfirm: () => void
}

function DeleteBrandForm({
  brandName,
  projectCount,
  pending,
  onConfirm,
}: {
  brandName: string
  projectCount: number | null
  pending: boolean
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  const matches = typed === brandName
  // An unknown count must never render as "0 projects" — understating the
  // blast radius of an irreversible cascade defeats the typed-name gate.
  const cascade =
    projectCount === null
      ? 'This deletes every project under this brand and everything on their canvases.'
      : projectCount === 1
        ? 'This deletes 1 project and everything on its canvas.'
        : `This deletes ${projectCount} projects and everything on their canvases.`

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete brand “{brandName}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {cascade} This cannot be undone. Type the brand name to confirm.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex flex-col gap-1.5 py-2">
        <Label htmlFor="delete-brand-confirm">Brand name</Label>
        <Input
          id="delete-brand-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={brandName}
          autoComplete="off"
        />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className={cn(buttonVariants({ variant: 'destructive' }))}
          disabled={!matches || pending}
          onClick={(e) => {
            e.preventDefault()
            if (!matches || pending) return
            onConfirm()
          }}
        >
          {pending ? 'Deleting…' : 'Delete brand'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

export function DeleteBrandDialog({
  open,
  onOpenChange,
  brandName,
  projectCount,
  pending = false,
  onConfirm,
}: DeleteBrandDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {open ? (
          <DeleteBrandForm
            key={brandName}
            brandName={brandName}
            projectCount={projectCount}
            pending={pending}
            onConfirm={onConfirm}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
