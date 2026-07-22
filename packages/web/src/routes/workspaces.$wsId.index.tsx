import { useEffect, useState } from 'react'
import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Brand } from '@brandfactory/shared'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { api, AppError, callJson } from '@/api/client'
import {
  workspaceKeys,
  useWorkspace,
  useWorkspaceBrands,
  useWorkspaceProjects,
} from '@/api/queries/workspaces'
import { setLastWorkspaceId } from '@/lib/last-workspace'
import { BrandCard } from '@/components/brand/BrandCard'
import { ProjectCard } from '@/components/project/ProjectCard'
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

function NewBrandDialog({ wsId }: { wsId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await api.workspaces[':workspaceId'].brands.$post({
        param: { workspaceId: wsId },
        json: data,
      })
      return callJson<Brand>(res)
    },
    onSuccess: (brand) => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.brands(wsId) })
      setOpen(false)
      setName('')
      setDescription('')
      void navigate({ to: '/brands/$brandId', params: { brandId: brand.id } })
    },
    onError: (err) => {
      toast.error(err instanceof AppError ? err.message : 'Failed to create brand')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">+ Brand</Button>
      </DialogTrigger>
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
            mutation.mutate({
              name: name.trim(),
              ...(description.trim() ? { description: description.trim() } : {}),
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

function WorkspaceHomePage() {
  const { wsId } = workspaceDetailRoute.useParams()
  const { data: workspace, isPending: wsPending, isError: wsError } = useWorkspace(wsId)
  const { data: brands, isPending: brandsPending, isError: brandsError } = useWorkspaceBrands(wsId)
  const {
    data: recent,
    isPending: recentPending,
    isError: recentError,
  } = useWorkspaceProjects(wsId, 10)

  useEffect(() => {
    setLastWorkspaceId(wsId)
  }, [wsId])

  const hasBrands = (brands?.length ?? 0) > 0
  const hasProjects = (recent?.length ?? 0) > 0

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {wsPending ? '…' : wsError ? 'Workspace' : workspace?.name}
        </h1>
        <NewBrandDialog wsId={wsId} />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground">Brands</h2>

        {brandsPending && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
        {brandsError && <p className="mt-4 text-sm text-destructive">Failed to load brands.</p>}

        {!brandsPending && !brandsError && brands?.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">Add your first brand</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              A brand holds living guidelines — voice, audience, visuals — and the projects where
              you ideate with that context already loaded.
            </p>
            <NewBrandDialog wsId={wsId} />
          </div>
        )}

        {hasBrands && (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {brands!.map((brand) => (
              <BrandCard key={brand.id} brand={brand} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-muted-foreground">Recent work</h2>

        {recentPending && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
        {recentError && (
          <p className="mt-4 text-sm text-destructive">Failed to load recent projects.</p>
        )}

        {!recentPending && !recentError && hasBrands && !hasProjects && (
          <p className="mt-4 text-sm text-muted-foreground">Open a brand to start a project.</p>
        )}

        {!recentPending && !recentError && !hasBrands && (
          <p className="mt-4 text-sm text-muted-foreground">
            Projects will show up here once you have a brand and start creating.
          </p>
        )}

        {hasProjects && (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {recent!.map((p) => (
              <ProjectCard
                key={p.id}
                id={p.id}
                name={p.name}
                kind={p.kind}
                brandId={p.brandId}
                workspaceId={wsId}
                brandName={p.brandName}
                lastActivityAt={p.lastActivityAt}
                showBrandName
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export const workspaceDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/$wsId',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: WorkspaceHomePage,
})
