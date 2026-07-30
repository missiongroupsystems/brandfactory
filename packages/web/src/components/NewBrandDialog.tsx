import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Brand, CreateBrandInput } from '@brandfactory/shared'
import { api, AppError, callJson } from '@/api/client'
import { workspaceKeys } from '@/api/queries/workspaces'
import { normalizeWebsiteUrl } from '@/lib/website-url'
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

export interface NewBrandDialogProps {
  /** Workspace the brand is created in. */
  wsId: string
  /** Controlled open state (e.g. switcher menu item). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Optional trigger; omit when opening purely via `open`. */
  trigger?: React.ReactNode
}

/**
 * Brand peer of `NewWorkspaceDialog`, and controlled/uncontrolled for the same
 * reason: the workspace home renders it behind its own trigger, while
 * `BrandSwitcher` has no trigger to give — the opener is a menu item that must
 * close before the dialog opens.
 *
 * Lived inside `routes/workspaces.$wsId.index.tsx` until the switcher became a
 * second caller.
 */
export function NewBrandDialog({ wsId, open, onOpenChange, trigger }: NewBrandDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [websiteError, setWebsiteError] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const isControlled = open !== undefined
  const resolvedOpen = isControlled ? open : uncontrolledOpen
  const setOpen = (next: boolean) => {
    // Clear on close, not only on success — see NewWorkspaceDialog. The header
    // pill makes this reachable from every page in a brand, so a cancelled
    // attempt must not hand the next one back a half-typed name, and least of
    // all a website error about a field that is now empty.
    if (!next) {
      setName('')
      setDescription('')
      setWebsiteUrl('')
      setWebsiteError(null)
    }
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const mutation = useMutation({
    mutationFn: async (data: CreateBrandInput) => {
      const res = await api.workspaces[':workspaceId'].brands.$post({
        param: { workspaceId: wsId },
        json: data,
      })
      return callJson<Brand>(res)
    },
    onSuccess: (brand) => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.brands(wsId) })
      setOpen(false)
      void navigate({ to: '/brands/$brandId', params: { brandId: brand.id } })
    },
    onError: (err) => {
      toast.error(err instanceof AppError ? err.message : 'Failed to create brand')
    },
  })

  return (
    <Dialog open={resolvedOpen} onOpenChange={setOpen}>
      {trigger != null && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New brand</DialogTitle>
        </DialogHeader>
        <form
          id="new-brand-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            const website = normalizeWebsiteUrl(websiteUrl)
            if (!website.ok) {
              setWebsiteError(website.error)
              return
            }
            setWebsiteError(null)
            mutation.mutate({
              name: name.trim(),
              ...(description.trim() ? { description: description.trim() } : {}),
              // Omitted rather than sent as null: `websiteUrl` is
              // optional-nullable on create, and a brand that never had one has
              // nothing to clear.
              ...(website.value ? { websiteUrl: website.value } : {}),
            })
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-name">Name</Label>
            <Input
              id="brand-name"
              placeholder="Acme"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-description">Description (optional)</Label>
            <Input
              id="brand-description"
              placeholder="What this brand is about"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-website">Website (optional)</Label>
            <Input
              id="brand-website"
              placeholder="casavostra.com"
              value={websiteUrl}
              onChange={(e) => {
                setWebsiteUrl(e.target.value)
                if (websiteError) setWebsiteError(null)
              }}
              aria-invalid={websiteError ? true : undefined}
              aria-describedby={websiteError ? 'brand-website-error' : undefined}
            />
            {websiteError && (
              <p id="brand-website-error" className="text-xs text-destructive">
                {websiteError}
              </p>
            )}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-brand-form" disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
