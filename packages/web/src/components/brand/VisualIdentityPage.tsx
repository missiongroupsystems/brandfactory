import { useState } from 'react'
import { toast } from 'sonner'
import type { BrandAsset, BrandAssetId, UpdateBrandAssetInput } from '@brandfactory/shared'
import { AppError } from '@/api/client'
import {
  useBrandAssets,
  useCreateAsset,
  useDeleteAsset,
  useReorderAssets,
  useRestoreAsset,
  useUpdateAsset,
} from '@/api/queries/assets'
import { uploadBlob, useSignedReadUrls } from '@/api/queries/blobs'
import { useBrand } from '@/api/queries/brands'
import { AssetLibraryView } from '@/components/brand/AssetLibraryView'
import type { MiniApp } from '@/components/brand/miniApps'
import { IMAGE_URL_REFUSAL, probeImageUrl } from '@/lib/image-url'

// ---------------------------------------------------------------------------
// VisualIdentityPage — the data half of the asset library
// ---------------------------------------------------------------------------
//
// Same split as the brand hub: this owns every query and every mutation,
// `AssetLibraryView` owns the layout and takes callbacks. That split was what
// let the 2E mockup render the same component against fixtures with no
// QueryClient; the mockup is deleted (2F took its asset route, 3G the rest) and
// the property it was built on is why the view is still testable without one.

/** What a dropped file becomes. Images are images; everything else is a file. */
function kindForFile(file: File): 'image' | 'file' {
  return file.type.startsWith('image/') ? 'image' : 'file'
}

export function VisualIdentityPage({ brandId, app }: { brandId: string; app: MiniApp }) {
  const { data: brand, isPending: brandPending, isError: brandError } = useBrand(brandId)
  const { data: assets, isPending, isError } = useBrandAssets(brandId)
  const create = useCreateAsset(brandId)
  const update = useUpdateAsset(brandId)
  const del = useDeleteAsset(brandId)
  const restore = useRestoreAsset(brandId)
  const reorder = useReorderAssets(brandId)
  const [uploading, setUploading] = useState(false)

  // Every blob key on the page, resolved in one `useQueries` so each keeps its
  // own 4-minute re-sign. The view never learns that a URL expires.
  const blobKeys = (assets ?? [])
    .map((a) => (a.source === 'blob' ? a.blobKey : null))
    .filter((k): k is string => k !== null)
  const urls = useSignedReadUrls(blobKeys)

  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof AppError ? err.message : fallback)
  }

  async function handleUploadFiles(files: File[]) {
    setUploading(true)
    try {
      // Sequential rather than `Promise.all`: the server appends `position` by
      // reading the current maximum, so N concurrent creates of one kind would
      // race and land on the same number. Uploads are a handful of files at a
      // time and the ordering is what the user sees.
      for (const file of files) {
        try {
          const { key } = await uploadBlob({ file })
          await create.mutateAsync({
            kind: kindForFile(file),
            source: 'blob',
            label: file.name,
            blobKey: key,
            mime: file.type || null,
            filename: file.name,
            sizeBytes: file.size,
          })
        } catch (err) {
          fail(err, `Could not add ${file.name}`)
        }
      }
    } finally {
      setUploading(false)
    }
  }

  /**
   * Record-time link validation (2D's finding, resolved here).
   *
   * The URL is loaded as an image *before* the row is written, and a failure
   * refuses the save rather than storing a link that will render as nothing.
   * The alternative — accept it and let the hub show a monogram — is
   * indistinguishable from having no logo at all, which is the finding the
   * 1.8.0 screenshots produced.
   *
   * Returns the message for the form to render inline, next to the field still
   * holding the URL, rather than a toast that fires away from the input.
   */
  async function handleRecordLink(url: string): Promise<string | null> {
    const probe = await probeImageUrl(url)
    if (!probe.ok) return probe.message
    try {
      await create.mutateAsync({
        kind: 'image',
        source: 'link',
        label: hostOf(url) ?? 'Linked image',
        url,
      })
      return null
    } catch (err) {
      return err instanceof AppError ? err.message : IMAGE_URL_REFUSAL
    }
  }

  function handleAddColor({ label, value }: { label: string; value: string }) {
    create.mutate(
      { kind: 'color', source: 'inline', label, value },
      { onError: (err) => fail(err, 'Could not add the colour') },
    )
  }

  function handleUpdate(id: BrandAssetId, patch: UpdateBrandAssetInput) {
    update.mutate({ id, patch }, { onError: (err) => fail(err, 'Could not save that change') })
  }

  /**
   * Delete, with the way back attached to it.
   *
   * 1.10.0 shipped this as a one-click disappearance and named the gap: *"a
   * misclick is a disappearance. The fix is an Undo, not a dialog."* A dialog
   * would tax every deliberate delete to catch the rare accidental one; the row
   * is soft-deleted and its bytes are never swept, so the way back was always
   * there and simply had no caller.
   *
   * The asset's label is in the toast because a grid of thumbnails gives no
   * other clue which row just left.
   */
  function handleDelete(id: BrandAssetId) {
    const label = (assets ?? []).find((a) => a.id === id)?.label
    del.mutate(id, {
      onError: (err) => fail(err, 'Could not remove that asset'),
      onSuccess: () => {
        toast(label ? `Removed ${label}` : 'Asset removed', {
          action: {
            label: 'Undo',
            onClick: () =>
              restore.mutate(id, {
                onError: (err) => fail(err, 'Could not restore that asset'),
              }),
          },
        })
      },
    })
  }

  /**
   * Reorder as one transactional call.
   *
   * 2E did this as N independent `PATCH`es because `reorderAssets` had no route
   * — the Stage 1–2 review shipped one. The batch matters more than it looks:
   * moving a swatch renumbers every row after it, so the old shape raced N
   * writes against each other and could leave the ramp half-renumbered under a
   * toast that named no row.
   *
   * Unchanged rows are still filtered out. The transaction makes that an
   * optimisation rather than a correctness question, but sending nine updates
   * to move one swatch would still be nine rows touched for one intent.
   */
  function handleReorderColors(ids: BrandAssetId[]) {
    const current = assets ?? []
    const updates = ids
      .map((id, index) => ({ id, position: (index + 1) * 100 }))
      .filter(({ id, position }) => current.find((a) => a.id === id)?.position !== position)
    if (updates.length === 0) return
    reorder.mutate(updates, { onError: (err) => fail(err, 'Could not reorder') })
  }

  if (brandPending || isPending) {
    return <Shell app={app}>Loading…</Shell>
  }
  if (brandError || isError || !brand) {
    return <Shell app={app}>Failed to load this brand&apos;s assets.</Shell>
  }

  return (
    <AssetLibraryView
      brand={brand}
      assets={assets ?? []}
      resolveBlob={(key) => urls[key] ?? ''}
      uploading={uploading}
      onUploadFiles={(files) => void handleUploadFiles(files)}
      onRecordLink={handleRecordLink}
      onAddColor={handleAddColor}
      onUpdateAsset={handleUpdate}
      onDeleteAsset={handleDelete}
      onReorderColors={handleReorderColors}
    />
  )
}

/** `https://cdn.example.com/a/b.svg` → `cdn.example.com`. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function Shell({ app, children }: { app: MiniApp; children: React.ReactNode }) {
  const Icon = app.icon
  return (
    <div className="flex-1 overflow-auto p-6">
      <h1 className="flex items-center gap-2">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {app.title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

export type { BrandAsset }
