import { useState } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import { toast } from 'sonner'
import { LLM_PROVIDER_IDS } from '@brandfactory/shared'
import type { LLMProviderId } from '@brandfactory/shared'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { AppError } from '@/api/client'
import { useWorkspaceSettings, useUpdateWorkspaceSettings } from '@/api/queries/settings'
import { useUpdateWorkspace, useWorkspace } from '@/api/queries/workspaces'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// §4 / §12.4: the accent is spent on the primary action, one hero metric, the
// active/selected state and brand chrome — a badge is none of those, and a 10%
// accent tint is not a colour the palette has. "Where did this value come
// from" is an *informational* distinction, so it takes the `info` tint; the
// fallback is the neutral beige pill the guide reserves for plain states.
function SourceBadge({ source }: { source: 'workspace' | 'env' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        source === 'workspace'
          ? 'bg-status-info-tint text-status-info'
          : 'bg-surface-sunken text-muted-foreground'
      }`}
    >
      {source === 'workspace' ? 'Workspace setting' : 'Env default'}
    </span>
  )
}

// Local edits overlay; null means "use whatever the server returned"
type FormDraft = { provider: LLMProviderId; model: string }

function WorkspaceSettingsPage() {
  const { wsId } = workspaceSettingsRoute.useParams()
  const { data: workspace } = useWorkspace(wsId)
  const { data: settings, isPending, isError } = useWorkspaceSettings(wsId)
  const mutation = useUpdateWorkspaceSettings(wsId)
  const rename = useUpdateWorkspace(wsId)

  const [draft, setDraft] = useState<FormDraft | null>(null)
  const [nameDraft, setNameDraft] = useState<string | null>(null)

  const provider: LLMProviderId | '' = draft?.provider ?? settings?.llmProviderId ?? ''
  const model: string = draft?.model ?? settings?.llmModel ?? ''
  const name = nameDraft ?? workspace?.name ?? ''

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !workspace || name.trim() === workspace.name) return
    rename.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          setNameDraft(null)
          toast.success('Workspace renamed')
        },
        onError: (err) =>
          toast.error(err instanceof AppError ? err.message : 'Failed to rename workspace'),
      },
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!provider || !model.trim()) return
    mutation.mutate(
      { llmProviderId: provider, llmModel: model.trim() },
      {
        onSuccess: () => {
          setDraft(null)
          toast.success('Settings saved')
        },
        onError: (err) =>
          toast.error(err instanceof AppError ? err.message : 'Failed to save settings'),
      },
    )
  }

  const isDirty =
    settings && (provider !== settings.llmProviderId || model.trim() !== settings.llmModel)
  const nameDirty = workspace ? name.trim() !== workspace.name && name.trim().length > 0 : false

  return (
    <div className="flex-1 overflow-auto p-6">
      <PageHeader title="Workspace settings" />

      {workspace && (
        <form onSubmit={handleNameSubmit} className="mb-10 max-w-md space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">Workspace</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input id="ws-name" value={name} onChange={(e) => setNameDraft(e.target.value)} />
          </div>
          <Button type="submit" disabled={!nameDirty || rename.isPending}>
            {rename.isPending ? 'Saving…' : 'Save name'}
          </Button>
        </form>
      )}

      {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load settings.</p>}

      {settings && (
        <form onSubmit={handleSubmit} className="max-w-md space-y-6">
          <h2 className="text-sm font-medium text-muted-foreground">LLM defaults</h2>
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="llm-provider">LLM provider</Label>
                <SourceBadge source={settings.source} />
              </div>
              <Select
                value={provider}
                onValueChange={(v) =>
                  setDraft((d) => ({ provider: v as LLMProviderId, model: d?.model ?? model }))
                }
              >
                <SelectTrigger id="llm-provider">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {LLM_PROVIDER_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="llm-model">Model</Label>
              <Input
                id="llm-model"
                placeholder="e.g. claude-sonnet-4-6"
                value={model}
                onChange={(e) =>
                  setDraft((d) => ({
                    provider: d?.provider ?? (provider as LLMProviderId),
                    model: e.target.value,
                  }))
                }
              />
            </div>

            <p className="text-xs text-muted-foreground">
              API keys for this provider are read from the server env. DB-persisted keys are a later
              pass.
            </p>
          </div>

          <Button
            type="submit"
            disabled={!provider || !model.trim() || !isDirty || mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      )}
    </div>
  )
}

export const workspaceSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/$wsId/settings',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: WorkspaceSettingsPage,
})
