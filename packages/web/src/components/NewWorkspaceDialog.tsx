import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Workspace } from '@brandfactory/shared'
import { api, AppError, callJson } from '@/api/client'
import { workspaceKeys } from '@/api/queries/workspaces'
import { setLastWorkspaceId } from '@/lib/last-workspace'
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

export interface NewWorkspaceDialogProps {
  /** Controlled open state (e.g. switcher menu item). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Optional trigger; omit when opening purely via `open`. */
  trigger?: React.ReactNode
}

export function NewWorkspaceDialog({ open, onOpenChange, trigger }: NewWorkspaceDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [name, setName] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const isControlled = open !== undefined
  const resolvedOpen = isControlled ? open : uncontrolledOpen
  const setOpen = (next: boolean) => {
    // Clear on close, not only on success — see NewProjectDialog.
    if (!next) setName('')
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const mutation = useMutation({
    mutationFn: async (workspaceName: string) => {
      const res = await api.workspaces.$post({ json: { name: workspaceName } })
      return callJson<Workspace>(res)
    },
    onSuccess: (workspace) => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all() })
      setLastWorkspaceId(workspace.id)
      setOpen(false)
      setName('')
      void navigate({ to: '/workspaces/$wsId', params: { wsId: workspace.id } })
    },
    onError: (err) => {
      toast.error(err instanceof AppError ? err.message : 'Failed to create workspace')
    },
  })

  return (
    <Dialog open={resolvedOpen} onOpenChange={setOpen}>
      {trigger != null && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
        </DialogHeader>
        <form
          id="new-workspace-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            mutation.mutate(name.trim())
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              placeholder="Acme Inc."
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
            form="new-workspace-form"
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
