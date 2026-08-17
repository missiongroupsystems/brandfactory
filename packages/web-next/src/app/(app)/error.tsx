"use client";

import { useEffect } from "react";
import { OctagonXIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the whole app shell.
 *
 * `error.message` is deliberately shown. This is an internal tool for a team of about a
 * dozen — a generic "something went wrong" costs them the one piece of information that
 * would let them tell us what happened, and there is no untrusted audience to protect it
 * from.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <OctagonXIcon aria-hidden className="size-5 text-error" strokeWidth={1.5} />
        <p className="text-h3 text-ink">Something failed on this page</p>
        {/* Mono because it is a machine's words, not ours (§5.4). */}
        <p className="max-w-lg font-mono text-helper break-words text-ink-secondary">
          {error.message}
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-ink-tertiary">digest: {error.digest}</p>
        ) : null}
      </div>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
