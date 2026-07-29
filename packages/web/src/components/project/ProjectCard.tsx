import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { ProjectKind } from '@brandfactory/shared'
import { AppError } from '@/api/client'
import { useDeleteProject, useUpdateProject } from '@/api/queries/projects'
import { DeleteProjectDialog } from '@/components/entity/DeleteProjectDialog'
import { EntityMenu } from '@/components/entity/EntityMenu'
import { RenameDialog } from '@/components/entity/RenameDialog'
import { formatRelativeTime } from '@/lib/relative-time'

export interface ProjectCardProps {
  id: string
  name: string
  kind: ProjectKind
  brandId: string
  workspaceId: string
  /** ISO timestamp — server-computed last activity (D1) on every surface. */
  lastActivityAt: string
  /** Shown only in workspace-level contexts (recent work across brands). */
  brandName?: string
  showBrandName?: boolean
}

export function ProjectCard({
  id,
  name,
  kind,
  brandId,
  workspaceId,
  lastActivityAt,
  brandName,
  showBrandName = false,
}: ProjectCardProps) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const update = useUpdateProject(id, brandId, workspaceId)
  const del = useDeleteProject(id, brandId, workspaceId)

  return (
    <>
      <div className="group relative flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-elevation-1 transition-colors duration-150 hover:bg-accent">
        <div className="absolute top-2 right-2 z-10">
          <EntityMenu
            label={`Actions for ${name}`}
            onRename={() => setRenameOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        </div>
        {/* A real link, not a button + navigate(): Cmd/middle-click must open a
            project in a new tab, and AT should announce a link. `inset-0`
            stretches the hit area over the whole card so the padding gutter is
            clickable too, while the ⋯ menu stays above it via z-10. */}
        <Link
          to="/projects/$projectId"
          params={{ projectId: id }}
          className="flex flex-col gap-2 pr-8 text-left before:absolute before:inset-0 before:content-['']"
        >
          {/* The name owns its own row, and the kind badge has moved down to the
              meta line. Found by the front-end mockup's live pass, in a card the
              hub has shipped since 0.9.0: on the hub's "Other threads" grid a
              card is ~235px, and a `shrink-0` badge plus the ⋯ menu's gutter left
              the name a ~60px column that wrapped one word per line. `truncate`
              alone does not fix that — it only turns four bad lines into one
              unreadable one, because the width was never the name's to begin
              with. The badge is a secondary fact and the meta row is where the
              other secondary facts already are. */}
          <div className="min-w-0 truncate pr-2 font-medium group-hover:text-accent-foreground">
            {name}
          </div>
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            {/* Sentence case, 12px/500, neutral beige (§0.4, §12.4) — `kind`
                arrives lowercase off the wire, so `capitalize` is what makes
                it a sentence rather than a shout. */}
            <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 font-medium text-muted-foreground capitalize">
              {kind}
            </span>
            {showBrandName && brandName ? <span className="truncate">{brandName}</span> : null}
            {showBrandName && brandName ? <span aria-hidden>·</span> : null}
            <span className="shrink-0">{formatRelativeTime(lastActivityAt)}</span>
          </div>
        </Link>
      </div>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        resource="project"
        initialName={name}
        pending={update.isPending}
        onSubmit={(values) => {
          update.mutate(
            { name: values.name },
            {
              onSuccess: () => {
                setRenameOpen(false)
                toast.success('Project renamed')
              },
              onError: (err) =>
                toast.error(err instanceof AppError ? err.message : 'Failed to rename project'),
            },
          )
        }}
      />

      <DeleteProjectDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectName={name}
        pending={del.isPending}
        onConfirm={() => {
          del.mutate(undefined, {
            onSuccess: () => {
              setDeleteOpen(false)
              toast.success('Project deleted')
            },
            onError: (err) =>
              toast.error(err instanceof AppError ? err.message : 'Failed to delete project'),
          })
        }}
      />
    </>
  )
}
