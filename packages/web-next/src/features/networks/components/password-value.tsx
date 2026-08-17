"use client";

import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * A wifi password, with the three states it actually has.
 *
 *   1. **Not recorded** — nobody has entered one. `has_password_*` is false.
 *   2. **On file, not visible to you** — the API returned the restricted schema, on which the
 *      password field does not exist at all. `has_password_*` is true and `value` is undefined.
 *   3. **Visible** — the ops role, so the value came down and can be revealed or copied.
 *
 * Distinguishing (1) from (2) is the entire reason `has_password_guest` / `has_password_staff`
 * exist on both response shapes. Collapsing them would tell an outlet manager "no password" for
 * a network that has one, and they would go and set a new one.
 *
 * Concealed by default in state (3): this screen gets shown on a laptop in a dining room, and
 * the staff password should not be readable over a shoulder just because the page is open. Copy
 * works **without revealing**, because pasting into a device is the common task and reading it
 * aloud is not.
 */
export function PasswordValue({
  label,
  value,
  onFile,
}: {
  label: string;
  /** Present only on the sensitive response shape. */
  value?: string | null;
  /** `has_password_*` — true when one is stored, whatever this caller is allowed to see. */
  onFile: boolean;
}) {
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // State 1: nothing stored.
  if (!onFile && !value) {
    return (
      <span className="text-ink-tertiary">
        <span aria-hidden>—</span>
        <span className="sr-only">No password recorded</span>
      </span>
    );
  }

  // State 2: stored, but this caller got the schema without password fields on it. Tested with
  // `value === undefined` rather than falsiness — null would mean the field came down empty.
  if (value === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 text-helper text-ink-secondary">
        <LockIcon aria-hidden className="size-3.5 shrink-0" />
        On file — restricted to the operations team
      </span>
    );
  }

  if (value === null) {
    return (
      <span className="text-ink-tertiary">
        <span aria-hidden>—</span>
        <span className="sr-only">No password recorded</span>
      </span>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
      toast.success(`${label} copied`);
      // Reverts the tick without a timer in an effect — this component may unmount first, and
      // the toast has already confirmed it regardless.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — the browser blocked clipboard access");
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className={revealed ? "font-mono text-helper" : "font-mono text-helper tracking-widest"}>
        {revealed ? value : "••••••••••"}
      </span>
      <span className="sr-only">{revealed ? "" : "Password hidden"}</span>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setRevealed((current) => !current)}
        aria-pressed={revealed}
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
        <span className="sr-only">{revealed ? `Hide ${label}` : `Reveal ${label}`}</span>
      </Button>

      <Button variant="ghost" size="icon-xs" onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span className="sr-only">Copy {label}</span>
      </Button>
    </span>
  );
}
