"use client";

import { Loader2Icon } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { EMPTY } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The white card a table sits in, and the footer underneath it.
 *
 * `overflow-hidden` on the card is what stops the first and last rows painting over the 12px
 * corner radius — a table is a rectangle and the card is not.
 */
export function TableCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-e1",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Cursor pagination, rendered honestly.
 *
 * The API pages on a UUIDv7 cursor (`backend/app/domain/pagination.py`) and returns
 * `next_cursor` — a *forward* pointer and nothing else. There is no total count and no previous
 * cursor, both by design: a `COUNT(*)` on every list page is a second query for a number nobody
 * acts on, and offset pages shift under inserts.
 *
 * So this is "load more" and a count of what is loaded, not "page 3 of 12" and not "1–50 of
 * 214". Both of those would be inventions. The count says *loaded* rather than *total* for the
 * same reason: after one page of fifty with more behind it, "50 outlets" is a false statement
 * and "50 loaded" is a true one.
 */
export function LoadMore({
  loadedCount,
  noun,
  plural,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  loadedCount: number;
  noun: string;
  /** Given explicitly where "+ s" is wrong — "entities", not "entitys". */
  plural?: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const label = `${loadedCount} ${loadedCount === 1 ? noun : (plural ?? `${noun}s`)}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
      {/* aria-live so the count is announced after "Load more" — the button stays put and the
          only thing that changes is further down the page. */}
      <p aria-live="polite" className="text-helper text-ink-secondary">
        {hasMore ? `${label} loaded` : label}
      </p>

      {hasMore ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? (
            <>
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
              Loading
            </>
          ) : (
            "Load more"
          )}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A nullable value in a table cell.
 *
 * The em dash is `aria-hidden` with a real phrase behind it, because a screen reader announces a
 * bare "—" as either "em dash" or nothing at all, and a silent cell is indistinguishable from a
 * cell that failed to render. "Not recorded" is also more accurate than "none": nobody has typed
 * a postal code, which is not the same as the outlet not having one.
 */
export function Value({
  children,
  className,
  mono,
}: {
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  const isEmpty =
    children === null || children === undefined || children === "" || children === EMPTY;

  if (isEmpty) {
    return (
      <span className={cn("text-ink-tertiary", className)}>
        <span aria-hidden>{EMPTY}</span>
        <span className="sr-only">Not recorded</span>
      </span>
    );
  }

  return (
    <span className={cn(mono && "font-mono text-helper", className)}>{children}</span>
  );
}
