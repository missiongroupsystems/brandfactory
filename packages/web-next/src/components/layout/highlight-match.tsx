import * as React from "react";

/**
 * Marks the run of `text` that a list search matched.
 *
 * The match is a **case-insensitive literal substring** — the exact contract the backend's
 * `search.contains` builds (a `LIKE %q%` over escaped input), so what is highlighted can never
 * disagree with what was matched. `query` is a plain string, not a pattern: its regex
 * metacharacters are escaped before use.
 *
 * This is the load-bearing piece of the widened list search: once a row can match on a field
 * other than its title (a contract on its vendor's name, an outlet on its address), the reader
 * needs the *why* pointed at in place rather than announced in a separate hint. The mark sits on
 * `--surface-selected`, deliberately not the accent, which carries a fixed per-view budget a
 * highlight repeated down a table would blow many times over.
 */
export function HighlightMatch({
  text,
  query,
}: {
  text: string;
  query?: string | null;
}): React.ReactNode {
  const q = query?.trim();
  if (!q) return text;

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  const lower = q.toLowerCase();

  return parts.map((part, i) =>
    part.toLowerCase() === lower ? (
      // `text-inherit` so the mark never overrides the cell's own ink (link brand, helper grey).
      <mark key={i} className="rounded-[2px] bg-surface-selected px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}
