import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { AppError } from '@/api/client'
import { useCreateProject } from '@/api/queries/projects'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface NewProjectDialogProps {
  brandId: string
  workspaceId: string
  /**
   * Omit for a freeform project; pass a mini-app's template id to create a
   * standardized thread. Threaded straight through to `useCreateProject`.
   */
  templateId?: string
  /** Dialog heading — mini-apps call these "threads", not "projects". */
  title?: string
  /** Optional controlled open (tests / external triggers). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
}

export function NewProjectDialog({
  brandId,
  workspaceId,
  templateId,
  title = 'New project',
  open: controlledOpen,
  onOpenChange,
  trigger,
}: NewProjectDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [name, setName] = useState('')
  const navigate = useNavigate()
  const mutation = useCreateProject(brandId, workspaceId)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (next: boolean) => {
    // Clear on close, not only on success — otherwise cancelling and reopening
    // shows the abandoned draft, and the same idiom as RenameDialog's keyed
    // remount is expected here.
    if (!next) setName('')
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger != null ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button size="sm">New project</Button>
        </DialogTrigger>
      )}
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          id="new-project-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            mutation.mutate(
              { name: name.trim(), ...(templateId !== undefined ? { templateId } : {}) },
              {
                onSuccess: (project) => {
                  setOpen(false)
                  setName('')
                  void navigate({
                    to: '/projects/$projectId',
                    params: { projectId: project.id },
                  })
                },
                onError: (err) => {
                  toast.error(err instanceof AppError ? err.message : 'Failed to create project')
                },
              },
            )
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              placeholder="Q3 campaign brainstorm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-project-form"
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
