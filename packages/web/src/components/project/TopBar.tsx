import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { BrandWithSections, Project } from '@brandfactory/shared'
import { AppError } from '@/api/client'
import { useDeleteProject, useUpdateProject } from '@/api/queries/projects'
import { DeleteProjectDialog } from '@/components/entity/DeleteProjectDialog'
import { EntityMenu } from '@/components/entity/EntityMenu'
import { RenameDialog } from '@/components/entity/RenameDialog'

export function TopBar({ project, brand }: { project: Project; brand: BrandWithSections }) {
  const navigate = useNavigate()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const update = useUpdateProject(project.id, brand.id, brand.workspaceId)
  const del = useDeleteProject(project.id, brand.id, brand.workspaceId)

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm">
        <Link
          to="/brands/$brandId"
          params={{ brandId: brand.id }}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          {brand.name}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
        <EntityMenu
          label={`Actions for ${project.name}`}
          onRename={() => setRenameOpen(true)}
          onDelete={() => setDeleteOpen(true)}
        />
      </div>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        resource="project"
        initialName={project.name}
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
        projectName={project.name}
        pending={del.isPending}
        onConfirm={() => {
          del.mutate(undefined, {
            onSuccess: () => {
              setDeleteOpen(false)
              toast.success('Project deleted')
              void navigate({ to: '/brands/$brandId', params: { brandId: brand.id } })
            },
            onError: (err) =>
              toast.error(err instanceof AppError ? err.message : 'Failed to delete project'),
          })
        }}
      />
    </>
  )
}
