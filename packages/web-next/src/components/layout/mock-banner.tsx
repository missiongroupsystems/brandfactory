import { FlaskConicalIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The persistent, non-dismissible honesty banner every façade (F1–F4) carries so a mock page
 * never reads as a live one. One definition, so the "nothing here is stored" contract cannot
 * drift across the three surfaces that render it (`nav.ts` gives the same items a "Mock" tag).
 *
 * `title` defaults to the storage wording; a design-only page that stores nothing *and* sends
 * nothing (Ops Forms) overrides it. The body is the page-specific explanation.
 */
export function MockBanner({
  title = "Mock data — nothing here is stored",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-info-tint p-3 text-info">
      <FlaskConicalIcon aria-hidden className="mt-px size-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="text-helper font-medium">{title}</p>
        <p className="max-w-[72ch] text-helper">{children}</p>
      </div>
    </div>
  );
}
