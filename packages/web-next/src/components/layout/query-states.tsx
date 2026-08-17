"use client";

import { InboxIcon, TriangleAlertIcon } from "lucide-react";
import type * as React from "react";

import { AppError } from "@/lib/api/bf-client";
import { ApiError } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The three states every SWR-backed list has to render, in one place.
 *
 * Written once because the interesting one is the error: a 403 on wifi passwords and a
 * failed connection to the API are completely different problems, and a component that
 * shows "Something went wrong" for both sends the reader looking in the wrong place.
 *
 * All three follow §12.8 / §3.3 — skeletons at the shape of the content, an error that pairs
 * the clay-red tint with an icon and a sentence rather than relying on the colour.
 */

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    // On a card rather than bare: beige shimmer on the sunken canvas is invisible.
    <div
      aria-busy
      role="status"
      className="mx-6 flex flex-col gap-2 rounded-xl border border-border bg-card p-5 shadow-e1 md:mx-8"
    >
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function QueryError({ error }: { error: unknown }) {
  const { title, detail } = describe(error);
  return (
    <div className="px-6 pt-2 md:px-8">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl bg-error-tint p-4 text-error"
      >
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="max-w-[72ch] text-helper">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function describe(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) {
    if (error.isForbidden) {
      return { title: "Not permitted", detail: error.message };
    }
    if (error.isNotFound) {
      return { title: "Not found", detail: error.message };
    }
    if (error.isUnavailable) {
      return {
        title: "Service unavailable",
        detail: `${error.message} Document storage may not be configured.`,
      };
    }
    return { title: `Request failed (${error.status})`, detail: error.message };
  }

  // The BrandFactory server's refusals, which reach here through `bf-client.ts`. Without this
  // branch every one of them fell through to "could not reach the API" below — the same defect
  // `use-submit.ts` had on the write side, and the reason both are fixed together.
  if (error instanceof AppError) {
    if (error.isForbidden) return { title: "Not permitted", detail: error.message };
    if (error.isNotFound) return { title: "Not found", detail: error.message };
    if (error.isValidation) return { title: "The request was rejected", detail: error.message };
    return { title: `Request failed (${error.status})`, detail: error.message };
  }

  // Neither client: `fetch` itself rejected, so the API was never reached. Saying so
  // saves someone reading backend logs for a request that never arrived.
  return {
    title: "Could not reach the API",
    detail:
      "The request did not complete. Check that the backend is running and that " +
      "NEXT_PUBLIC_API_URL points at it.",
  };
}

/**
 * `hint` takes a node, not a string, so an empty state can *point somewhere*. `/service-reports`
 * is the first that had to: "no reports filed yet — 45 services are overdue" is only half an
 * answer without a way to reach them, and a hint that names another view while offering no route
 * to it is the "it got lost" failure this product exists to fix, one level down. Every existing
 * caller passes a string, which is a node.
 */
export function EmptyState({
  message,
  hint,
}: {
  message: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="px-6 md:px-8">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <InboxIcon aria-hidden className="size-5 text-ink-tertiary" strokeWidth={1.5} />
        <p className="text-sm font-medium text-ink">{message}</p>
        {hint ? <p className="max-w-[56ch] text-helper text-ink-secondary">{hint}</p> : null}
      </div>
    </div>
  );
}
