"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface ContentsEntry {
  anchor: string;
  label: string;
}

/**
 * The contents rail — what is on this page, and where you are in it.
 *
 * **The reason the brand book layout won over tabs** (plan §3): a marketer reads a brand top to
 * bottom the first time and jumps to one section forever after, which is the shape of a document
 * with a contents list, not of six panes that hide five sixths of the brand behind a click.
 *
 * Sticky, and hidden below `lg` — on a narrow screen the rail would be a screenful of links
 * standing between the reader and the brand, and the page is short enough to scroll.
 */
export function ProfileContents({ entries }: { entries: ContentsEntry[] }) {
  const active = useActiveAnchor(entries.map((entry) => entry.anchor));

  return (
    <nav aria-label="On this page" className="sticky top-6 hidden w-52 shrink-0 lg:block">
      <p className="mb-2 px-2 text-eyebrow text-ink-tertiary uppercase">On this page</p>
      <ul className="flex flex-col">
        {entries.map((entry) => (
          <li key={entry.anchor}>
            <a
              href={`#${entry.anchor}`}
              // `aria-current="location"` rather than a class alone: the highlight is the only
              // thing saying where the reader is, and a visual-only state is not a state.
              aria-current={active === entry.anchor ? "location" : undefined}
              className={cn(
                "block rounded-lg px-2 py-1.5 text-helper transition-colors duration-[120ms] hover:bg-surface-hover",
                active === entry.anchor ? "bg-surface-selected text-ink" : "text-ink-secondary",
              )}
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Which heading the reader is currently under.
 *
 * An `IntersectionObserver` over the band headings, with a `rootMargin` that narrows the root to
 * a band across the top of the viewport — so "active" means *at the top of the screen*, which is
 * where a reader's attention is, rather than *anywhere on screen*, which lights three entries at
 * once on a tall display.
 *
 * The observer is created inside the effect and the state is written from **its callback**, not
 * from the effect body: `react-hooks/set-state-in-effect` is a real gate in this package (it
 * broke the build once, see AGENTS.md), and a subscription that reports later is exactly the
 * pattern the rule leaves alone.
 *
 * Keyed on the joined anchors rather than the array, so a re-render passing an equal-but-new
 * array does not tear down and rebuild the observer on every scroll frame.
 */
function useActiveAnchor(anchors: string[]): string | null {
  const [active, setActive] = React.useState<string | null>(null);
  const key = anchors.join("|");

  React.useEffect(() => {
    const ids = key.split("|").filter(Boolean);
    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Document order, so scrolling down moves the highlight one entry at a time. Nothing in
        // the band leaves the previous answer standing — better a slightly stale highlight than
        // one that blanks between sections.
        const next = ids.find((id) => visible.has(id));
        if (next) setActive(next);
      },
      { rootMargin: "-16px 0px -70% 0px", threshold: 0 },
    );

    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);

  return active;
}
