import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Brand, CreateBrandInput } from '@brandfactory/shared'
import { api, AppError, callJson } from '@/api/client'
import { applyStartedJobToCache, startResearchJob, useResearchConfig } from '@/api/queries/research'
import { workspaceKeys } from '@/api/queries/workspaces'
import {
  RESEARCH_NEEDS_WEBSITE,
  RESEARCH_OPT_IN_LABEL,
  researchOptInHint,
} from '@/lib/research-copy'
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
 *
 * **Research opt-in (decision 1).** Creating a brand with a URL does **not**
 * start research by itself — a silent auto-start would spend ≈$0.40 on every
 * create. The checkbox is the first entry point of decision 1; the rail is the
 * second. Brand is created first either way (decision 2); research is a second
 * call after navigate, so a vendor outage never stands between you and a brand.
 */
export function NewBrandDialog({ wsId, open, onOpenChange, trigger }: NewBrandDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [websiteError, setWebsiteError] = useState<string | null>(null)
  // Default checked: the design mockup shows `[x]` once a website is present.
  // Still opt-in — empty website disables and unchecks the control.
  const [researchOptIn, setResearchOptIn] = useState(true)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const isControlled = open !== undefined
  const resolvedOpen = isControlled ? open : uncontrolledOpen
  // Only ask the deployment while the dialog can be seen — the answer is
  // deployment config and does not change while typing a name.
  const { data: researchConfig } = useResearchConfig({ enabled: resolvedOpen })
  const researchEnabled = researchConfig?.enabled === true

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
      setResearchOptIn(true)
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
    onSuccess: (brand, variables) => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.brands(wsId) })
      // Capture before setOpen clears the form — researchOptIn is form state.
      const startResearch =
        researchEnabled && researchOptIn && Boolean(variables.websiteUrl ?? brand.websiteUrl)
      setOpen(false)
      // Decision 2: brand first, then research. Navigate lands the hub; the
      // second call seeds the research cache so the rail does not flash idle.
      void navigate({ to: '/brands/$brandId', params: { brandId: brand.id } }).then(async () => {
        if (!startResearch) return
        try {
          const job = await startResearchJob(brand.id)
          applyStartedJobToCache(queryClient, brand.id, job)
        } catch (err) {
          // The brand exists. A failed start is a toast, not a failed create.
          toast.error(
            err instanceof AppError ? err.message : 'Brand created, but research could not start.',
          )
        }
      })
    },
    onError: (err) => {
      toast.error(err instanceof AppError ? err.message : 'Failed to create brand')
    },
  })

  // Live check against the field, not the last successful submit: the checkbox
  // must disable the moment the website is cleared, before Create.
  const websitePreview = normalizeWebsiteUrl(websiteUrl)
  const hasWebsite = websitePreview.ok && websitePreview.value !== null
  const researchChecked = researchOptIn && hasWebsite

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

          {/* Gated on deployment, not on website: when research is off the
              whole control is absent (1.7.0 dead-affordance rule), not disabled. */}
          {researchEnabled && (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
              <input
                id="brand-research"
                type="checkbox"
                checked={researchChecked}
                disabled={!hasWebsite}
                onChange={(e) => setResearchOptIn(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary disabled:opacity-50"
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="brand-research"
                  className={
                    hasWebsite
                      ? 'block cursor-pointer text-sm font-medium'
                      : 'block cursor-not-allowed text-sm font-medium text-muted-foreground'
                  }
                >
                  {RESEARCH_OPT_IN_LABEL}
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    — {researchOptInHint()}
                  </span>
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">{RESEARCH_NEEDS_WEBSITE}</p>
              </div>
            </div>
          )}
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
