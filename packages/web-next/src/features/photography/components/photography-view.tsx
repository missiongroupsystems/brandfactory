"use client";

import type { BrandAsset, PhotoCategory } from "@brandfactory/shared";
import { assetsInCategory } from "@brandfactory/shared";
import { PinIcon, SettingsIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { Button } from "@/components/ui/button";
import { useSignedReadUrl } from "@/lib/blob";
import { cn } from "@/lib/utils";

import { usePhotography, usePhotographyMutations } from "../hooks";
import { CategoryManager } from "./category-manager";

/** The filter's "everything" option. A category id is a string, so this cannot collide with one. */
const ALL = "__all__";
/** The photos filed under nothing — a real bucket, not an empty state. */
const UNCATEGORISED = "__uncategorised__";

/**
 * The brand's photography shelf: a grid, a subject filter, and the pin.
 *
 * **Pinned first, then the manual order** — `usePhotography` returns the list already sorted by
 * `photographyInReadingOrder`, which is a different comparator from `byPosition` on purpose. See
 * `asset/photography.ts`: teaching `byPosition` about the pin would change which image is the
 * brand's logo.
 *
 * **The filter runs client-side, and that is correct only because the read is whole.**
 * `GET /brands/:id/assets` returns every non-deleted asset of the brand with no cursor, so a
 * filtered count is a true count and an empty subject is genuinely empty. `list-every.ts` in this
 * package records what happens otherwise — *"a row stranded on page two is silently absent from it
 * — an absence a reader takes as fact rather than as truncation."* A subject filter over a
 * truncated library would say **no interior photos** to a brand that has forty. If that route ever
 * gains a cursor, this filter and the sort move to SQL in the same change.
 */
export function PhotographyView({ brandId }: { brandId: string }) {
  const { photos, categories, isLoading, error } = usePhotography(brandId);
  const [subject, setSubject] = React.useState<string>(ALL);
  const [managerOpen, setManagerOpen] = React.useState(false);

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={4} />;

  // **One definition of "photos filed under X", not four.** `assetsInCategory`
  // is in `@brandfactory/shared` beside the category schema and is where `null`
  // is documented as a bucket rather than an absence; four inline copies of the
  // same predicate are four places for that distinction to be forgotten.
  const shown =
    subject === ALL
      ? photos
      : assetsInCategory(photos, subject === UNCATEGORISED ? null : subject);

  const uncategorisedCount = assetsInCategory(photos, null).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SubjectChip
          label="All"
          count={photos.length}
          active={subject === ALL}
          onClick={() => setSubject(ALL)}
        />
        {categories.map((category) => (
          <SubjectChip
            key={category.id}
            label={category.name}
            count={assetsInCategory(photos, category.id).length}
            active={subject === category.id}
            onClick={() => setSubject(category.id)}
          />
        ))}
        {/* **Always offered when it holds anything**, whether or not any category exists.
            Every photo that predates 3B lives here, and a bucket that only appeared once
            somebody made a category would hide the entire existing library. */}
        {uncategorisedCount > 0 ? (
          <SubjectChip
            label="Uncategorised"
            count={uncategorisedCount}
            active={subject === UNCATEGORISED}
            onClick={() => setSubject(UNCATEGORISED)}
          />
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setManagerOpen(true)}
        >
          <SettingsIcon />
          Subjects
        </Button>
      </div>

      {photos.length === 0 ? (
        <EmptyState
          message="No photographs yet"
          hint="This brand's shot library is empty. Photographs uploaded to the photography shelf appear here, newest filing first."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          message="Nothing filed under this subject"
          hint="The photos are still there — they are filed under another subject, or under none."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((photo) => (
            <PhotoTile key={photo.id} photo={photo} brandId={brandId} categories={categories} />
          ))}
        </ul>
      )}

      <CategoryManager
        brandId={brandId}
        categories={categories}
        photos={photos}
        open={managerOpen}
        onOpenChange={setManagerOpen}
      />
    </div>
  );
}

function SubjectChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // **The label is explicit, because the computed one is wrong.** A count in
      // an adjacent span concatenates with no separator, so "All" plus "3"
      // announces as "All3". Naming it here also lets the number say what it
      // counts, which a bare digit beside a word does not.
      aria-label={`${label}, ${count} photo${count === 1 ? "" : "s"}`}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-transparent bg-surface-selected text-ink"
          : "border-border text-ink-secondary hover:bg-surface-hover",
      )}
    >
      {label}
      {/* The count is a *total*, not "N so far" — the read has no cursor, which is the
          property that makes stating one honest here. */}
      <span className="ml-1.5 text-ink-tertiary">{count}</span>
    </button>
  );
}

function PhotoTile({
  photo,
  brandId,
  categories,
}: {
  photo: BrandAsset;
  brandId: string;
  categories: PhotoCategory[];
}) {
  const { setPinned, setCategory } = usePhotographyMutations(brandId);
  const [busy, setBusy] = React.useState(false);
  const blobKey = photo.source === "blob" ? photo.blobKey : null;
  const { data: signedUrl } = useSignedReadUrl(blobKey);
  const src = photo.source === "link" ? photo.url : signedUrl;

  async function togglePin() {
    setBusy(true);
    try {
      await setPinned(photo.id, !photo.isPinned);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the pin");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2">
      <div className="relative aspect-4/3 overflow-hidden rounded-lg border border-border bg-surface-sunken">
        {src ? (
          /* eslint-disable-next-line @next/next/no-img-element --
             **Deliberately not `next/image`.** A blob source is a *signed* URL that expires in
             five minutes and is re-minted by `useSignedReadUrl` on a four-minute interval; the
             optimizer would cache the URL and serve a 403 the moment its signature lapsed. A link
             source is somebody else's host, which the optimizer would need configuring per
             domain. Revisit if the read path ever returns stable URLs. */
          <img
            src={src}
            alt={photo.alt ?? photo.label}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          // Named per photo: a grid of twenty otherwise offers twenty identical
          // "Pin" buttons and a screen reader cannot tell them apart.
          aria-label={`${photo.isPinned ? "Unpin" : "Pin"} ${photo.label}`}
          aria-pressed={photo.isPinned}
          disabled={busy}
          onClick={togglePin}
          className="absolute right-1 top-1 bg-card/80 backdrop-blur-sm"
        >
          <PinIcon className={cn(photo.isPinned && "fill-current")} />
        </Button>
      </div>

      <p className="truncate text-helper text-ink">{photo.label}</p>

      <select
        aria-label={`Subject for ${photo.label}`}
        value={photo.categoryId ?? ""}
        disabled={busy}
        onChange={async (event) => {
          const next = event.target.value === "" ? null : event.target.value;
          setBusy(true);
          try {
            await setCategory(photo.id, next);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not file the photo");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-md border border-border-input bg-card px-2 py-1 text-helper text-ink-secondary"
      >
        {/* The empty value is Uncategorised, which is a choice rather than a blank. */}
        <option value="">Uncategorised</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </li>
  );
}
