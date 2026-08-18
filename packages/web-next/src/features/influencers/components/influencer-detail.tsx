"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, PencilIcon, Trash2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { DetailItem, DetailList } from "@/components/layout/detail-list";
import { LoadingRows, PageState, QueryError } from "@/components/layout/query-states";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveBrand } from "@/features/brands/active-brand";
import {
  type NamedBrand,
  resolveBrandNames,
} from "@/features/registry-brands/components/brand-names-cell";
import { useSubmit } from "@/hooks/use-submit";
import { formatDateTime, PENDING } from "@/lib/format";
import {
  INFLUENCER_PLATFORM_LABELS,
  INFLUENCER_STATUS_LABELS,
  INFLUENCER_STATUS_TONES,
  INFLUENCER_VERTICAL_ICONS,
  INFLUENCER_VERTICAL_LABELS,
} from "@/lib/labels";

import { formatEngagement, formatFollowers, GENERALIST } from "../format";
import { useInfluencer, useInfluencerMutations } from "../hooks";
import { tierFor } from "../tiers";
import { InfluencerForm } from "./influencer-form";

/**
 * One creator — the record, and **only** the record.
 *
 * What is here is what the row holds: who they are, where they post, how far they reach, how well
 * that audience engages, what they cover, which brands they are engaged for, and whatever somebody
 * wrote down about them. There is no campaign history, no past posts and no rate card, because
 * none of those exists — not on this table and not anywhere on this server. Thirteen cards over
 * nothing is the failure `outlet-detail.tsx` records inheriting from the Operations Hub, and
 * inventing them a second time on a table one release old would be worse.
 *
 * **The first line names the platform**, and that is load-bearing rather than decorative. A slug
 * comes from the handle, so one person on Instagram and TikTok gives `priyaskin` and
 * `priyaskin-2` and the URL does not say which is which — `InfluencerSlugSchema` states that cost
 * and names this page as where it is paid.
 *
 * `influencerRef` is a **slug or an id** and the read resolves either, which is what lets
 * `influencerHref` emit the readable form when it holds the record and a bare id when it does not.
 */
export function InfluencerDetail({ influencerRef }: { influencerRef: string }) {
  const router = useRouter();
  const { influencer, error, isLoading } = useInfluencer(influencerRef);
  const { brands } = useActiveBrand();
  const { remove } = useInfluencerMutations();
  const { run, reset, isPending, formError } = useSubmit();

  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  /**
   * Set when the delete starts and never cleared on success, because the page is on its way to
   * `/influencers` from that point.
   *
   * It exists to suppress **one** error: `remove()` awaits the cache sweep, the sweep refetches the
   * row that was just deleted, and the 404 that comes back lands on `useInfluencer` before
   * `router.push` runs — so a successful delete rendered an error panel for the length of the
   * navigation. `outlet-detail.tsx` found this the same way.
   */
  const [isDeleting, setIsDeleting] = React.useState(false);

  const brandById = React.useMemo(() => {
    const map = new Map<string, NamedBrand>();
    for (const brand of brands) map.set(brand.id, brand);
    return map;
  }, [brands]);

  /**
   * The same derivation the table's cell runs, reused rather than re-written — the rule it carries
   * is *"a cached index that has not arrived is a pending request, never a missing fact"*, so one
   * unresolved id makes the whole set unknown instead of making the list shorter. Two brands
   * rendered where the row names three is a false statement that looks like a true one.
   *
   * `?? []` because the hooks run before the loading branch below; an absent record resolves to
   * the same shape as a creator engaged for nobody, and neither reaches the screen.
   */
  const { names: brandNames, pending: brandsPending } = React.useMemo(
    () => resolveBrandNames(influencer?.brandIds ?? [], brandById),
    [influencer?.brandIds, brandById],
  );

  // Cosmetic id→slug rewrite once the creator loads. `history.replaceState`, not `router.replace`:
  // the SWR entry is keyed on `influencerRef`, so a navigation would refetch the row that is
  // already on screen. The id URL resolves on its own; this only relabels the bar.
  React.useEffect(() => {
    if (influencer && influencer.slug && influencerRef !== influencer.slug) {
      window.history.replaceState(null, "", `/influencers/${influencer.slug}`);
    }
  }, [influencer, influencerRef]);

  // The delete's own 404 is not news — see `isDeleting`. Every other error still reaches the
  // reader, including one raised while the delete was refused.
  if (error && !isDeleting)
    return (
      <PageState>
        <QueryError error={error} />
      </PageState>
    );
  if (isLoading || !influencer)
    return (
      <PageState>
        <LoadingRows rows={6} />
      </PageState>
    );

  async function handleDelete() {
    if (!influencer) return;
    setIsDeleting(true);
    const ok = await run(async () => {
      await remove(influencer.id);
      toast.success(`${influencer.name} deleted`);
    });
    if (ok) {
      setConfirmOpen(false);
      router.push("/influencers");
    } else {
      // The row is still there and the reader is still on it, so the page owes them its error
      // states back.
      setIsDeleting(false);
    }
  }

  const tier = tierFor(influencer.followers);
  const VerticalIcon = influencer.vertical ? INFLUENCER_VERTICAL_ICONS[influencer.vertical] : null;

  return (
    <div className="flex flex-col gap-6 px-6 pt-6 pb-8 md:px-8 md:pt-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/influencers"
          className="inline-flex w-fit items-center gap-1.5 text-helper text-ink-secondary hover:text-brand hover:underline"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          All creators
        </Link>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
          {/* No monogram, unlike the outlet's header. That mark is a *brand's*, and a creator has
              between zero and fifty of them — drawing one would pick a brand out of a set the
              record deliberately keeps unordered, and drawing none is honest about a person this
              product holds no picture of. */}
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-h1 text-ink">{influencer.name}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {/* Mono, as the table renders it, and the `@` is added here: the column never carries
                  one, because `InfluencerHandleSchema` rejects a leading sigil rather than
                  stripping it. */}
              <span className="font-mono text-helper text-ink-secondary">@{influencer.handle}</span>
              <span className="text-helper text-ink-tertiary">
                on {INFLUENCER_PLATFORM_LABELS[influencer.platform]}
              </span>
              <Badge variant={INFLUENCER_STATUS_TONES[influencer.status]}>
                {INFLUENCER_STATUS_LABELS[influencer.status]}
              </Badge>
              <Badge variant="outline">{tier.label}</Badge>
            </div>
          </div>

          {/* **Both writes live here and nowhere else.** The table lists and adds; this page is
              where a row is corrected and removed, because it is the only surface that shows the
              whole record — and a delete offered from a row is a delete offered over a summary of
              what is about to go. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                reset();
                setConfirmOpen(true);
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Audience</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList>
              {/* **The full figure, not the table's `1.24M`.** This is the page somebody opens to
                  check a number before quoting it, and a rounded one is the single thing it must
                  not show them. */}
              <DetailItem label="Followers" mono>
                {formatFollowers(influencer.followers)}
              </DetailItem>
              {/* `Value`'s em dash for a rate nobody has measured — a prospect who has never run a
                  campaign has no engagement history, which is not a measured zero. */}
              <DetailItem label="Engagement rate" mono>
                {formatEngagement(influencer.engagementRate)}
              </DetailItem>
              {/* The band and its range together, because the band is derived and the reader has
                  no other way to see the threshold it was derived against — a creator on 99,800
                  followers sits one band below one on 100,200, and the two numbers above make that
                  visible only when the range is beside them. */}
              <DetailItem label="Reach tier">{`${tier.label} · ${tier.range}`}</DetailItem>
              <DetailItem label="Vertical">
                {influencer.vertical && VerticalIcon ? (
                  <span className="inline-flex items-center gap-1.5">
                    <VerticalIcon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
                    {INFLUENCER_VERTICAL_LABELS[influencer.vertical]}
                  </span>
                ) : (
                  // See `GENERALIST`: `null` here is a creator who covers no one vertical, which
                  // the em dash would report as a field nobody filled in.
                  <span className="text-ink-tertiary">{GENERALIST}</span>
                )}
              </DetailItem>
            </DetailList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Brands</CardTitle>
          </CardHeader>
          <CardContent>
            {influencer.brandIds.length === 0 ? (
              <p className="text-helper text-ink-secondary">
                Not engaged yet. A creator on the shortlist has no brand against them, which is a
                decision rather than a gap.
              </p>
            ) : brandsPending ? (
              // The whole set, not the part of it that resolved. Foreign keys with
              // `ON DELETE CASCADE` on both sides mean an unresolvable id here can only be a
              // request in flight, which is the argument for the join table.
              <p className="text-ink-tertiary">
                <span aria-hidden>{PENDING}</span>
                <span className="sr-only">Loading brand names</span>
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {brandNames.map((name) => (
                  <li key={name}>
                    <Badge variant="outline">{name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList>
              <DetailItem label="Notes" span>
                {influencer.notes}
              </DetailItem>
              {/* The slug is on the page because it is the creator's web address and it does **not**
                  follow a corrected handle — `UpdateInfluencerInputSchema` says so — so
                  `/influencers/priyaskin` can end up pointing at `@priyaskincare`. That is a thing
                  to be able to look up rather than to discover from a link somebody else already
                  shared. */}
              <DetailItem label="Web address" mono>
                /influencers/{influencer.slug}
              </DetailItem>
              <DetailItem label="Added">{formatDateTime(influencer.createdAt)}</DetailItem>
              {/* Beside the reach, in spirit: a follower count is pulled from a platform and is
                  stale within the day, so when the row was last touched is what says whether the
                  figure above is worth quoting. */}
              <DetailItem label="Last updated">{formatDateTime(influencer.updatedAt)}</DetailItem>
            </DetailList>
          </CardContent>
        </Card>
      </div>

      <InfluencerForm influencer={influencer} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) reset();
        }}
        title={`Delete ${influencer.name}?`}
        description={
          // A relationship that ended is a status, not a deletion — saying so here is what keeps
          // this button for the case it is actually for. `past` exists precisely because somebody
          // you stopped working with is a thing you look up rather than a thing you hide, and the
          // schema has no `archived` for the same reason.
          <>
            This removes the record for good, along with every brand it is linked to. A creator you
            have stopped working with is <strong>Past</strong> rather than deleted — set the status
            instead unless this row was entered by mistake.
          </>
        }
        onConfirm={handleDelete}
        error={formError}
        isPending={isPending}
      />
    </div>
  );
}
