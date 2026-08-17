"use client";

import { AlertTriangle, Check, CloudOff, Loader2, PencilLine } from "lucide-react";

import { useSchemeStore } from "@/features/spaces/store";

/**
 * What the autosave is doing, said out loud.
 *
 * This is the other half of the decision in `docs/executing/spaces.md` §3.5. The canvas
 * cannot render the server's answer for a drag, so it edits the draft freely — and the
 * price of that is that the user is owed a truthful account of whether their work is
 * actually saved. An editor that silently autosaves is fine right up until the one time
 * it does not.
 *
 * `conflict` is deliberately the loudest and is the only state that asks for an action.
 * It means another tab (or another person) saved over this scheme, so the draft on screen
 * is built on a document the server has already replaced. Retrying would overwrite them;
 * reloading is the only honest move, and the message says so rather than offering a
 * button that would quietly do the wrong thing.
 */
const STATES = {
  idle: null,
  dirty: {
    icon: PencilLine,
    text: "Unsaved changes",
    tone: "text-ink-tertiary",
  },
  saving: {
    icon: Loader2,
    text: "Saving…",
    tone: "text-ink-tertiary",
    spin: true,
  },
  saved: {
    icon: Check,
    text: "Saved",
    tone: "text-ink-tertiary",
  },
  error: {
    icon: CloudOff,
    text: "Could not save — retrying on your next edit",
    tone: "text-error",
  },
  conflict: {
    icon: AlertTriangle,
    text: "Changed in another tab — reload before editing further",
    tone: "text-error",
  },
} as const;

export function SaveIndicator() {
  const saveState = useSchemeStore((s) => s.saveState);
  const state = STATES[saveState];

  if (!state) return null;
  const Icon = state.icon;
  const spin = "spin" in state && state.spin;

  return (
    <span
      // Polite, not assertive: this changes on every debounce and an assertive region
      // would interrupt a screen reader mid-sentence throughout an editing session.
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1.5 text-helper ${state.tone}`}
    >
      <Icon
        className={`size-3.5 shrink-0 ${spin ? "animate-spin" : ""}`}
        strokeWidth={1.75}
        aria-hidden
      />
      {state.text}
    </span>
  );
}
