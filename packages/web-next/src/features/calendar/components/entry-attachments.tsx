"use client";

import type { BrandAsset } from "@brandfactory/shared";
import { ImagePlus, Loader2Icon, Paperclip, X } from "lucide-react";
import * as React from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { photographyService } from "@/features/photography/api";
import { SCOPES, useRevalidate } from "@/lib/api/cache";
import { uploadBlob, useSignedReadUrl } from "@/lib/blob";
import { cn } from "@/lib/utils";

/** The schema's own cap (`SocialPostAssetIdsSchema.max(20)`), said before the server says it. */
const MAX_ATTACHMENTS = 20;

/**
 * An entry's attachments: ordered thumbnails, a picker over the brand's image library, and an
 * upload.
 *
 * **Attachments are library assets, never files on the post.** The post holds ids into the
 * brand's own library, and the server refuses an id from another brand. So an upload here lands
 * in the library first — whether or not the entry is ever saved — which is the rule the legacy
 * editor set: an uploaded image is a brand asset, not an orphan.
 *
 * **The asset list shares the photography screen's cache key.** Both read the same route, and one
 * key means an upload here appears on the photography shelf without a reload, and the reverse.
 *
 * The value is a full replacement list, in order — the shape the patch route takes — so this
 * component only ever hands its parent a new array.
 */
export function EntryAttachments({
  brandId,
  value,
  onChange,
  disabled,
}: {
  brandId: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const revalidate = useRevalidate();
  const { data: assets } = useSWR<BrandAsset[]>(
    brandId ? [SCOPES.bfPhotos, brandId] : null,
    () => photographyService.listAssets(brandId),
    { revalidateOnFocus: false },
  );
  const [picking, setPicking] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const byId = React.useMemo(
    () => new Map<string, BrandAsset>((assets ?? []).map((a) => [a.id, a])),
    [assets],
  );
  const library = React.useMemo(
    () => (assets ?? []).filter((a) => a.kind === "image" && !value.includes(a.id)),
    [assets, value],
  );
  const full = value.length >= MAX_ATTACHMENTS;

  function attach(ids: string[]) {
    const next = [...value, ...ids.filter((id) => !value.includes(id))];
    if (next.length > MAX_ATTACHMENTS) {
      setProblem(`An entry carries at most ${MAX_ATTACHMENTS} attachments.`);
      return;
    }
    setProblem(null);
    onChange(next);
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProblem(null);
    try {
      const ids: string[] = [];
      for (const file of Array.from(files)) {
        // Bytes first, then the row: a failed upload writes nothing, the order the decks and
        // photography forms already settled for the same reason.
        const { key } = await uploadBlob({ file });
        const row = await photographyService.createPhoto(brandId, {
          kind: "image",
          source: "blob",
          blobKey: key,
          label: file.name.replace(/\.[^.]+$/, "") || file.name,
          mime: file.type || null,
          filename: file.name,
          sizeBytes: file.size,
        });
        ids.push(row.id);
      }
      await revalidate(SCOPES.bfPhotos);
      attach(ids);
    } catch (err) {
      setProblem(
        err instanceof Error
          ? `That upload did not finish: ${err.message}`
          : "That upload did not finish.",
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Attachments">
          {value.map((id, index) => (
            <li key={id} className="relative">
              <Thumb asset={byId.get(id)} />
              <button
                type="button"
                aria-label={`Remove attachment ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x !== id))}
                className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-border bg-card text-ink-secondary"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-helper text-ink-secondary">No attachments yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || full || !brandId}
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
        >
          <Paperclip data-icon="inline-start" />
          Add from library
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || full || uploading || !brandId}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <ImagePlus data-icon="inline-start" />
          )}
          {uploading ? "Uploading" : "Upload"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Upload attachments"
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {problem ? (
        <p role="alert" className="text-helper text-error">
          {problem}
        </p>
      ) : null}

      {picking ? (
        library.length === 0 ? (
          <p className="text-helper text-ink-secondary">
            Every image in this brand&rsquo;s library is attached already, or there are none yet.
          </p>
        ) : (
          <ul
            className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto rounded-lg border border-border p-2"
            aria-label="Brand image library"
          >
            {library.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => attach([asset.id])}
                  className="flex w-full flex-col gap-1 text-left"
                  aria-label={`Attach ${asset.label}`}
                >
                  <Thumb asset={asset} fluid />
                  <span className="truncate text-xs text-ink-secondary">{asset.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

/**
 * One image, by signed URL or by link.
 *
 * **An id with no asset still gets a tile.** A soft-deleted image is not in the list, and an id
 * kept invisibly in the draft would ride along on the next save — so the reader sees it, and can
 * remove it, rather than it being quietly re-sent.
 */
function Thumb({ asset, fluid }: { asset: BrandAsset | undefined; fluid?: boolean }) {
  const blobKey = asset && asset.source === "blob" ? asset.blobKey : null;
  const { data: signed } = useSignedReadUrl(blobKey);
  const src = asset ? (asset.source === "link" ? asset.url : signed) : undefined;
  return (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-sunken text-[11px] text-ink-tertiary",
        fluid ? "aspect-square w-full" : "size-20",
      )}
    >
      {asset === undefined ? (
        "Not in library"
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed URL that expires; see photography-view.tsx
        <img src={src} alt={asset.alt ?? asset.label} className="size-full object-cover" />
      ) : (
        "Loading"
      )}
    </span>
  );
}
