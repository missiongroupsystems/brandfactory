"use client";

import type { SocialPost } from "@brandfactory/shared";
import { SocialPostStatusSchema } from "@brandfactory/shared";
import * as React from "react";

import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { useSocialPosts } from "../hooks";

const STATUS_LABELS: Record<(typeof SocialPostStatusSchema.options)[number], string> = {
  draft: "Draft",
  ready: "Ready",
  posted: "Posted",
};

/**
 * A brand's planned social posts — **read-only, and the page says so.**
 *
 * The planner lives at :5173 and is 11,814 lines including its month grid, drag-to-schedule and AI
 * brainstorm. Moving it is a separate migration. This screen exists so the marketing funnel's link
 * to a social push has somewhere in *this* app to land: without it the only options were plain text
 * or a link that ejects the reader to a different app on a different port.
 *
 * **A screen that cannot write must say so**, or a reader files a bug against an edit control that
 * was never built — which is the same honesty the `Empty` nav tag was for.
 *
 * `highlightId` is the funnel's arrival: the post the reader clicked through to.
 */
export function SocialPostsView({
  brandId,
  highlightId,
}: {
  brandId: string;
  highlightId?: string;
}) {
  const { posts, isLoading, error } = useSocialPosts(brandId);

  if (error) return <QueryError error={error} />;
  if (isLoading) return <LoadingRows rows={5} />;

  if (posts.length === 0) {
    return (
      <EmptyState
        message="No posts planned yet"
        hint="Posts are planned in the social calendar, which is still in the previous app. They appear here once they exist."
      />
    );
  }

  const scheduled = posts.filter((post) => post.scheduledAt !== null);
  const unscheduled = posts.filter((post) => post.scheduledAt === null);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-helper text-ink-secondary">
        Read-only here. Posts are written and scheduled in the social calendar, which has not moved
        to this app yet.
      </p>

      {scheduled.length > 0 ? (
        <PostGroup title="Scheduled" posts={scheduled} highlightId={highlightId} />
      ) : null}

      {/* **The idea tray, and it is a first-class state.** `scheduledAt: null` means
          "a post exists and nobody has picked a day" — not missing data. */}
      {unscheduled.length > 0 ? (
        <PostGroup title="Unscheduled" posts={unscheduled} highlightId={highlightId} />
      ) : null}
    </div>
  );
}

function PostGroup({
  title,
  posts,
  highlightId,
}: {
  title: string;
  posts: SocialPost[];
  highlightId?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-eyebrow uppercase text-ink-tertiary">{title}</h2>
      <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-card">
        {posts.map((post) => (
          <li
            key={post.id}
            id={`post-${post.id}`}
            className={cn(
              "flex flex-col gap-1 px-4 py-3",
              // The arrival marker for a funnel click-through. A row somebody was
              // sent to, that looks like every other row, has not been arrived at.
              post.id === highlightId && "bg-surface-selected",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{SOCIAL_PLATFORM_LABELS[post.platform]}</Badge>
              <Badge variant={post.status === "posted" ? "success" : "default"}>
                {STATUS_LABELS[post.status]}
              </Badge>
              <span className="text-helper text-ink-tertiary">
                {post.scheduledAt ? formatDate(post.scheduledAt) : "No date yet"}
              </span>
              {post.createdBy === "agent" ? (
                // The unreviewed pile — `social_posts.ts` names this composition as
                // the question a marketer actually asks.
                <Badge variant="outline">Drafted by the planner</Badge>
              ) : null}
            </div>
            <p className={cn("text-sm", post.body ? "text-ink" : "text-ink-tertiary")}>
              {post.body || "Slot claimed, copy pending"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
