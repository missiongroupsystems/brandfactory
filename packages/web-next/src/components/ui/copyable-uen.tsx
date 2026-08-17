"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

/**
 * A registry (UEN) number that copies to the clipboard on click — the common task is
 * pasting it into a government portal.
 *
 * Promoted out of `vendors-view.tsx` when the outlet profile (Cluster C) became the second
 * caller: AGENTS.md's rule is to share once two features use it, and this carries no
 * feature-specific logic. The behaviour is unchanged — the toast confirms the copy, so the
 * two-second check-icon flip needs no effect cleanup.
 */
export function CopyableUen({ uen, className }: { uen: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(uen);
      setCopied(true);
      toast.success("UEN copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — the browser blocked clipboard access");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={
        "group -mx-1 flex items-center gap-1 rounded-md px-1 text-helper text-ink-tertiary hover:text-ink-secondary" +
        (className ? ` ${className}` : "")
      }
    >
      UEN
      <span className="font-mono">{uen}</span>
      {copied ? (
        <CheckIcon aria-hidden className="size-3 shrink-0" />
      ) : (
        <CopyIcon
          aria-hidden
          className="size-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
        />
      )}
      <span className="sr-only">, copy to clipboard</span>
    </button>
  );
}
