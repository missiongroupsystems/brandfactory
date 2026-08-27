"use client";

import Link from "next/link";

import type { FunnelActivityStatus, FunnelStageWithDetail, Platform } from "@brandfactory/shared";
import { DEFAULT_FUNNEL_STAGES } from "@brandfactory/shared";
import { ExternalLinkIcon, LinkIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { FUNNEL_ACTIVITY_STATUS_LABELS } from "@/lib/labels";

import { useSocialPosts } from "@/features/social-posts/hooks";

import { useFunnel, useFunnelMutations } from "../hooks";

/**
 * A brand's user journey, stage by stage — the one view of what it runs and where.
 *
 * **Ordered, because the order is the subject.** A journey read out of order is not a journey,
 * which is why `funnel_stages` carries a `position` where Resources and Decks deliberately do not.
 *
 * **Status is tracking, never a score.** The request bounds it away from performance explicitly —
 * the deep platforms measure that — so nothing here renders a number about how anything did.
 */
export function FunnelView({ brandId }: { brandId: string }) {
  const { stages, platforms, isLoading, error } = useFunnel(brandId);
  const { createStage } = useFunnelMutations(brandId);
  const [seeding, setSeeding] = React.useState(false);

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={4} />;

  /**
   * **This is the backfill, and it is deliberately a button rather than a migration.**
   * Brands created before Plan 4 have no stages: the six defaults are written with a brand now, but
   * nothing rewrote history — and six stage names in SQL would be product copy duplicated into the
   * one language that cannot import the constant. Offering them here also keeps the request's word
   * that the set is editable: a brand that wants five should not have to delete a row the database
   * gave it unasked.
   */
  async function seedDefaults() {
    setSeeding(true);
    try {
      for (const name of DEFAULT_FUNNEL_STAGES) {
        await createStage({ name });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the stages");
    } finally {
      setSeeding(false);
    }
  }

  if (stages.length === 0) {
    return (
      <EmptyState
        message="No stages yet"
        hint={
          <span className="flex flex-col items-center gap-3">
            <span>
              A funnel maps the journey into this brand — awareness through to advocacy — and names
              what runs at each step. Start from the usual six, then rename or drop whatever does
              not fit.
            </span>
            <Button onClick={seedDefaults} disabled={seeding}>
              {seeding ? "Adding…" : "Add the six default stages"}
            </Button>
          </span>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {stages.map((stage) => (
        <StageBlock key={stage.id} stage={stage} brandId={brandId} platforms={platforms} />
      ))}
    </div>
  );
}

function StageBlock({
  stage,
  brandId,
  platforms,
}: {
  stage: FunnelStageWithDetail;
  brandId: string;
  platforms: Platform[];
}) {
  // The brand's planned posts, so an activity can point at one. Read-only in this
  // app — see `features/social-posts` for why the planner has not moved.
  const { posts } = useSocialPosts(brandId);
  const {
    attachPlatform,
    detachPlatform,
    createActivity,
    updateActivity,
    setLinkedPost,
    deleteActivity,
  } = useFunnelMutations(brandId);
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const unattached = platforms.filter(
    (platform) => !stage.platforms.some((p) => p.id === platform.id),
  );

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      // The server's own sentence, never a guess about the network.
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          {/* A real `<h2>`, not `CardTitle` — that renders a `div` (AGENTS.md). */}
          <h2 className="font-heading text-h3 text-ink">{stage.name}</h2>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {/* **One chip per platform, carrying both the way out and the way off.**
                An earlier draft listed every platform twice — once as a link in the
                header and once as a remove button below — which put the same name on
                screen twice per stage and made a five-platform stage read as ten. */}
            {stage.platforms.map((platform) => (
              <span
                key={platform.id}
                className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-helper"
              >
                {platform.url ? (
                  <a
                    href={platform.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-ink-secondary hover:underline"
                  >
                    {platform.name}
                    <ExternalLinkIcon aria-hidden className="size-3" />
                  </a>
                ) : (
                  // **No link derived where none is recorded.** The shop window has
                  // no URL, and inventing one is the failure the influencer platform
                  // badges already fixed once.
                  <span className="text-ink-tertiary">{platform.name}</span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${platform.name} from ${stage.name}`}
                  disabled={busy}
                  onClick={() => void run(() => detachPlatform(stage.id, platform.id))}
                  className="rounded-full p-0.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink"
                >
                  <XIcon aria-hidden className="size-3" />
                </button>
              </span>
            ))}

            {unattached.length > 0 ? (
              <Select
                aria-label={`Add a platform to ${stage.name}`}
                value=""
                disabled={busy}
                onChange={(event) => {
                  const platformId = event.target.value;
                  if (platformId) void run(() => attachPlatform(stage.id, platformId));
                }}
                containerClassName="w-auto"
              >
                <option value="">Add platform…</option>
                {unattached.map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {stage.activities.length === 0 ? (
          <p className="text-helper text-ink-tertiary">Nothing running here yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {stage.activities.map((activity) => (
              <li key={activity.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="flex-1 text-sm text-ink">{activity.title}</span>

                {/* Two dates, and the middle case is the common one: a Running
                    activity has a start and no end. A single date could not say that. */}
                <span className="text-helper text-ink-tertiary">
                  {activity.startsOn ? formatDate(activity.startsOn) : "—"}
                  {" → "}
                  {activity.endsOn ? formatDate(activity.endsOn) : "—"}
                </span>

                {/* **The control is the display.** An earlier draft put a tone badge
                    beside this select, which showed the status twice per row — and
                    `AGENTS.md` already settled that argument one screen over: one
                    choice from a closed list is a control showing its own value, not
                    a label plus a way to change it. */}
                <Select
                  aria-label={`Status for ${activity.title}`}
                  value={activity.status}
                  disabled={busy}
                  containerClassName="w-auto"
                  onChange={(event) =>
                    void run(() =>
                      updateActivity(stage.id, activity.id, {
                        status: event.target.value as FunnelActivityStatus,
                      }),
                    )
                  }
                >
                  {(Object.keys(FUNNEL_ACTIVITY_STATUS_LABELS) as FunnelActivityStatus[]).map(
                    (status) => (
                      <option key={status} value={status}>
                        {FUNNEL_ACTIVITY_STATUS_LABELS[status]}
                      </option>
                    ),
                  )}
                </Select>

                {/* **The typed link the request asked for, for the one target that
                    exists.** Of the three it names — a social push, an influencer
                    program, a contract — only the first has a table. The other two
                    still go in the note, which the request permits: "otherwise it is
                    plain text." */}
                <Select
                  aria-label={`Linked post for ${activity.title}`}
                  value={activity.socialPostId ?? ""}
                  disabled={busy}
                  containerClassName="w-auto"
                  onChange={(event) =>
                    void run(() => setLinkedPost(stage.id, activity.id, event.target.value))
                  }
                >
                  <option value="">No linked post</option>
                  {posts.map((post) => (
                    <option key={post.id} value={post.id}>
                      {post.body ? post.body.slice(0, 60) : "Untitled post"}
                    </option>
                  ))}
                  {/* **A linked post the list no longer holds still needs an option.**
                      Social posts *soft*-delete, so `ON DELETE SET NULL` never fires and
                      the activity keeps its id — but the list filters `deletedAt`, so the
                      controlled value would match nothing and the select would display
                      "No linked post" over a link the database still has. Worse, the next
                      touch would write that lie back. Naming the state is the fix. */}
                  {activity.socialPostId &&
                  !posts.some((post) => post.id === activity.socialPostId) ? (
                    <option value={activity.socialPostId}>
                      Linked post (deleted from the calendar)
                    </option>
                  ) : null}
                </Select>

                {activity.socialPostId ? (
                  <Link
                    href={`/brands/${brandId}/social?post=${activity.socialPostId}`}
                    aria-label={`Open the post linked to ${activity.title}`}
                    className="text-ink-tertiary hover:text-ink"
                  >
                    <LinkIcon aria-hidden className="size-4" />
                  </Link>
                ) : null}

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${activity.title}`}
                  disabled={busy}
                  onClick={() => void run(() => deleteActivity(stage.id, activity.id))}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = title.trim();
              if (!trimmed) return;
              void run(async () => {
                await createActivity(stage.id, { title: trimmed, status: "planned" });
                setTitle("");
                setAdding(false);
              });
            }}
          >
            <Input
              value={title}
              autoFocus
              maxLength={200}
              aria-label={`New activity in ${stage.name}`}
              placeholder="Spring campaign"
              onChange={(event) => setTitle(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={busy || title.trim() === ""}>
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            aria-label={`Add an activity to ${stage.name}`}
            onClick={() => setAdding(true)}
          >
            <PlusIcon />
            Add activity
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
