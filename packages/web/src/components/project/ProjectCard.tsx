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
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 font-medium group-hover:text-accent-foreground">{name}</div>
            {/* Sentence case, 12px/500, neutral beige (§0.4, §12.4) — `kind`
                arrives lowercase off the wire, so `capitalize` is what makes
                it a sentence rather than a shout. */}
            <span className="mr-6 shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
              {kind}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
