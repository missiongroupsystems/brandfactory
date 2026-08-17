"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

/**
 * Copy some part of the brand to the clipboard.
 *
 * **The one thing on this page that genuinely works before integration**, and it is not a
 * throwaway: whatever tool a marketer is actually using today, copy is how the brand gets there
 * (plan §5.2). It also survives the wiring unchanged, because it operates on text the page
 * already holds.
 *
 * The mechanics follow `components/ui/copyable-uen.tsx` exactly — toast confirms, the check icon
 * flips back after two seconds, a blocked clipboard says so rather than failing silently. Not
 * promoted into `components/ui/` yet: AGENTS.md's rule is to share once a *second feature* needs
 * it, and the UEN copy has a different shape (it renders the value it copies).
 */
export function CopyButton({
  text,
  label,
  confirmation,
  className,
}: {
  /** Resolved lazily, so a whole-document serialisation is not run on every render. */
  text: () => string;
  label: string;
  /** What the toast says. Names the thing copied — "TL;DR copied", not "Copied". */
  confirmation: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      setCopied(true);
      toast.success(confirmation);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — the browser blocked clipboard access");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-helper text-ink-tertiary transition-colors duration-[120ms] hover:bg-surface-hover hover:text-ink-secondary",
        className,
      )}
    >
      {copied ? (
        <CheckIcon aria-hidden className="size-3.5" />
      ) : (
        <CopyIcon aria-hidden className="size-3.5" />
      )}
      {label}
    </button>
  );
}
