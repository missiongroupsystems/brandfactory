"use client";

import { brandDescriptionLine, type BrandSummary } from "@brandfactory/shared";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { brandNavHref } from "@/components/layout/nav";
import { EmptyState, LoadingRows, PageState, QueryError } from "@/components/layout/query-states";
import { Button } from "@/components/ui/button";
import { useActiveBrand } from "@/features/brands/active-brand";
import { NewBrandSheet } from "@/features/brands/components/new-brand-sheet";

/**
 * The workspace's brands, as cards — and the only way into a brand.
 *
 * **This replaced a dropdown, and the difference is the point.** The switcher in the sidebar
 * header showed one brand and hid the rest behind a chevron, which is the right control for
 * *changing* something and the wrong one for *choosing* something: a person who does not yet know
 * this workspace's brands could not see them without opening a menu, and what the menu then
 * offered was a list of bare names. A card carries the mark, the line the brand describes itself
 * with, and how much of it has been filled in — which is what somebody is actually reading for
 * when they open this page.
 *
 * **Cards, not a table.** Every list screen in this app is a table, because every one of them
 * holds tens to hundreds of rows that get filtered, grouped and scanned by column. A workspace
 * holds a handful of brands and nobody sorts them; what matters is recognising one, and
 * recognition is what the monogram and the hue are for. There is no filter row here for the same
 * reason — a search box over six cards is furniture.
 *
 * **The whole card is the link.** Not a title link with dead space around it: the card is one
 * target and the arrow is an affordance rather than the hit area. `focus-visible` is inherited
 * from the base layer — the anchor is the focusable element, so the ring lands on the card.
 */
export function BrandsGallery() {
  const { brands, brand: current, workspaceId, isLoading, error, select } = useActiveBrand();
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);

  // A list in flight is a pending request, never a missing fact — the house rule for every id
  // this app resolves through a cached map, and the reason "No brands yet" must not be the thing
  // that renders for the length of a round trip.
  if (isLoading) {
    return (
      <PageState>
        <LoadingRows rows={3} />
      </PageState>
    );
  }

  // **A failed request is not an empty workspace.** SWR reports a 500 or a dropped connection as
  // `isLoading: false, data: undefined`, which is indistinguishable from "none" unless `error` is
  // read — and here the empty state offers to *create* a brand, so getting this wrong would invite
  // someone to add a second Casa Vostra to a workspace whose contents they had never seen. A 401
  // does not reach here: `callJson` signs out instead.
  if (error) {
    return (
      <PageState>
        <QueryError error={error} />
      </PageState>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-helper text-ink-secondary">
          {brands.length === 1 ? "1 brand" : `${brands.length} brands`}
        </p>
        <Button variant="secondary" onClick={() => setCreating(true)} disabled={!workspaceId}>
          <PlusIcon data-icon="inline-start" />
          New brand
        </Button>
      </div>

      {brands.length === 0 ? (
        <EmptyState
          message="No brands yet"
          hint="A brand is the record every other record here is for — contracts, outlets and creators all point at one. Create the first and the sidebar will open inside it."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {brands.map((b) => (
            <BrandCard key={b.id} brand={b} isCurrent={b.id === current?.id} />
          ))}
        </div>
      )}

      <NewBrandSheet
        workspaceId={workspaceId}
        open={creating}
        onOpenChange={setCreating}
        // The brand you have just created is the one you want to be in, and this page's whole job
        // is getting you into one — so a successful create goes straight there rather than
        // returning you to a grid that has grown by one card you now have to find. The selection
        // is written first: `BrandNavHeader` writes it too, but only once the brands list has
        // landed, and the destination should not have to wait to agree with the rail.
        onCreated={(brandId) => {
          select(brandId);
          router.push(brandNavHref(brandId, ""));
        }}
      />
    </div>
  );
}

/**
 * One brand.
 *
 * The two counts are stated in the words the API means them in. `sectionCount` counts guideline
 * *rows*, not sections with something written in them — documented imprecision in
 * `BrandSummarySchema`, and repeating it as "3 sections written" here would turn it into a claim.
 */
function BrandCard({ brand, isCurrent }: { brand: BrandSummary; isCurrent: boolean }) {
  // TL;DR first, typed description second, nothing third — the one precedence rule, shared with
  // `packages/web`'s brand hub so the two apps print the same line under the same brand.
  const line = brandDescriptionLine({ tldr: brand.tldr, description: brand.description });

  return (
    <Link
      href={brandNavHref(brand.id, "")}
      className="group flex flex-col gap-4 rounded-xl border border-border-subtle bg-card p-5 transition-colors duration-[120ms] hover:border-border"
    >
      <div className="flex items-start gap-4">
        {/* The customer's hue, and the one element on this card allowed to carry it (§4). */}
        <BrandMark name={brand.name} seed={brand.id} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-base font-medium text-ink">{brand.name}</span>
          {isCurrent ? (
            // Not a `Badge`: this is not a property of the brand, it is where the reader was last.
            // Ink, not the accent — the accent's budget on this page is spent on the New brand
            // button, and a green pill on one card would read as a status the other cards lack.
            // `text-xs` rather than `text-eyebrow`: that token is the nav's one uppercase role
            // (§7.3) and borrowing its size here would put a second uppercase style in the product
            // the first time somebody copied this line.
            <span className="text-xs text-ink-tertiary">Last opened</span>
          ) : null}
        </div>
        <ArrowRightIcon
          aria-hidden
          className="mt-1 size-4 shrink-0 text-ink-tertiary transition-colors duration-[120ms] group-hover:text-ink"
        />
      </div>

      {/* Two lines, clamped, and the height is held whether or not there is a line — a grid whose
          cards are different heights because some brands have written a TL;DR reads as broken
          rather than as informative. */}
      <p className="line-clamp-2 min-h-[42px] text-helper text-ink-secondary">
        {line ?? <span className="text-ink-tertiary">No description yet</span>}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-helper text-ink-tertiary">
        <span>
          {brand.sectionCount === 1 ? "1 guideline section" : `${brand.sectionCount} guideline sections`}
        </span>
        <span aria-hidden>·</span>
        <span>{brand.projectCount === 1 ? "1 project" : `${brand.projectCount} projects`}</span>
      </div>
    </Link>
  );
}
