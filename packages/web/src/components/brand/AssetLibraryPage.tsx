import { useState } from 'react'
import { toast } from 'sonner'
import type {
  AssetLibrary,
  BrandAsset,
  BrandAssetId,
  UpdateBrandAssetInput,
} from '@brandfactory/shared'
import { assetsOfLibrary } from '@brandfactory/shared'
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
import { shelfName } from '@/components/brand/miniApps'
import { IMAGE_URL_REFUSAL, probeImageUrl } from '@/lib/image-url'

// ---------------------------------------------------------------------------
// AssetLibraryPage — the data half of one shelf
// ---------------------------------------------------------------------------
//
// Same split as the brand hub: this owns every query and every mutation,
// `AssetLibraryView` owns the layout and takes callbacks. That split was what
// let the 2E mockup render the same component against fixtures with no
// QueryClient; the mockup is deleted (2F took its asset route, 3G the rest) and
// the property it was built on is why the view is still testable without one.
//
// **One component for all three shelves, parameterised by `library`.** It was
// `VisualIdentityPage` until the split, and a second copy per shelf is the thing
// the plan forbids outright: *if a shelf ever needs its own component, the shelf
// is wrong.* The three differ in what they filter to and what they stamp on what
// they create — nothing else here branches.
//
// It takes no `MiniApp` — there is no `app` in scope on a `/brands/$id/identity`
// route, and a whole registry row is far more than this page needs. What it does
// take from the registry is the shelf's *name*, through `shelfName`, because the
// nav row you clicked to get here reads from the same function and the two must
// agree. That is a lookup, not a dependency on a row.

/** What a dropped file becomes. Images are images; everything else is a file. */
function kindForFile(file: File): 'image' | 'file' {
  return file.type.startsWith('image/') ? 'image' : 'file'
}

export function AssetLibraryPage({ brandId, library }: { brandId: string; library: AssetLibrary }) {
  // The shelf's name, for the loading frame and for the Move to… toast. From
  // the registry, which is the only place any surface gets it — see `shelfName`.
  const title = shelfName(library)
  const { data: brand, isPending: brandPending, isError: brandError } = useBrand(brandId)
  const { data: assets, isPending, isError } = useBrandAssets(brandId)
  const create = useCreateAsset(brandId)
  const update = useUpdateAsset(brandId)
  const del = useDeleteAsset(brandId)
  const restore = useRestoreAsset(brandId)
  const reorder = useReorderAssets(brandId)
  const [uploading, setUploading] = useState(false)

  // One query for the brand, sliced to this shelf. `useBrandAssets` is already
  // mounted by the nav panel on every page of the brand, so filtering here costs
  // a pass over an array rather than a second request.
  const shelf = assetsOfLibrary(assets ?? [], library)

  // Every blob key **on this shelf**, resolved in one `useQueries` so each keeps
  // its own 4-minute re-sign. The view never learns that a URL expires.
  //
  // Computed from the filtered list, not the brand's: three shelves each
  // re-signing every blob in the brand is three times the work for one page's
  // worth of pictures, and each of those signatures is a request.
  const blobKeys = shelf
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
            // The shelf you are standing on is the shelf you are filing to.
            // Without this the server would fall back to `defaultLibraryFor`,
            // which is the derivation the column replaced — and a PNG menu
            // dropped on Collateral would land in Photography.
            library,
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
        library,
        label: hostOf(url) ?? 'Linked image',
        url,
      })
      return null
    } catch (err) {
      return err instanceof AppError ? err.message : IMAGE_URL_REFUSAL
    }
  }

  /**
   * **`'identity'` always, never the `library` prop.**
   *
   * A colour is identity wherever you happen to be standing — there is no such
   * thing as a photography-shelf swatch — and the Add-colour row only renders on
   * the identity shelf anyway. Passing the prop here would look tidier and would
   * make a mis-shelved colour representable the moment that stops being true.
   */
  function handleAddColor({ label, value }: { label: string; value: string }) {
    create.mutate(
      { kind: 'color', source: 'inline', library: 'identity', label, value },
      { onError: (err) => fail(err, 'Could not add the colour') },
    )
  }

  /**
   * Every patch the view can send — a label, a role, a status, and **a shelf.**
   *
   * A `{ library }` patch is Move to…, and it is the one patch that takes the
   * row off the page you are looking at. So it gets what delete gets: a toast
   * naming where it went, and an Undo that moves it back. A misfile with no way
   * back is the failure mode this repo has already paid for once (1.10.0), and
   * a row that silently vanishes from a grid of thumbnails is that failure
   * wearing a different verb.
   *
   * The Undo is a second `updateAsset`, not a `restoreAsset`: nothing was
   * deleted, so the way back is the same door in the other direction.
   */
  function handleUpdate(id: BrandAssetId, patch: UpdateBrandAssetInput) {
    const from = shelf.find((a) => a.id === id)
    update.mutate(
      { id, patch },
      {
        onError: (err) => fail(err, 'Could not save that change'),
        onSuccess: () => {
          if (!patch.library || !from) return
          toast(`Moved ${from.label} to ${shelfName(patch.library)}`, {
            action: {
              label: 'Undo',
              onClick: () =>
                update.mutate(
                  { id, patch: { library: from.library } },
                  { onError: (err) => fail(err, 'Could not move that asset back') },
                ),
            },
          })
        },
      },
    )
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
    const label = shelf.find((a) => a.id === id)?.label
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
    const current = shelf
    const updates = ids
      .map((id, index) => ({ id, position: (index + 1) * 100 }))
      .filter(({ id, position }) => current.find((a) => a.id === id)?.position !== position)
    if (updates.length === 0) return
    reorder.mutate(updates, { onError: (err) => fail(err, 'Could not reorder') })
  }

  if (brandPending || isPending) {
    return <Shell title={title}>Loading…</Shell>
  }
  if (brandError || isError || !brand) {
    return <Shell title={title}>Failed to load this brand&apos;s assets.</Shell>
  }

  return (
    <AssetLibraryView
      brand={brand}
      library={library}
      assets={shelf}
      resolveBlob={(key) => urls[key] ?? ''}
      uploading={uploading}
      onUploadFiles={(files) => void handleUploadFiles(files)}
      onRecordLink={handleRecordLink}
      // **Identity only, and the gate is the callback rather than a branch in
      // the view.** The view's existing rule — an affordance exists exactly when
      // its callback does — already covers this, so the Add-colour row needs no
      // condition of its own. A colour belongs to the identity shelf and nowhere
      // else; see `handleAddColor`, which files `'identity'` regardless.
      onAddColor={library === 'identity' ? handleAddColor : undefined}
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

/**
 * The pending / failed frame. Takes a title string rather than a `MiniApp` —
 * an icon on a loading message was never carrying anything the heading did not,
 * and the heading it shows is `shelfName`'s, so the frame and the page it
 * resolves into say the same word.
 */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-auto p-6">
      <h1>{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

export type { BrandAsset }
