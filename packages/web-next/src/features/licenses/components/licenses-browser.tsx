"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

import { ExpiringView } from "./expiring-view";
import { HeldView } from "./held-view";
import { LibraryView } from "./library-view";
import { RequirementsView } from "./requirements-view";

const VIEWS = [
  { key: "held", label: "Held licences" },
  { key: "expiring", label: "Expiring" },
  { key: "requirements", label: "Requirements" },
  { key: "library", label: "Library" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

/**
 * The faces of the licences area: what we hold, what is coming due, what we need, and what
 * exists in Singapore. One page, because they are one workflow — the library proposes, a
 * requirement records the need, a licence discharges it. **Expiring is not a fourth dataset**
 * but a cross-cut worklist over the held licences (every expiring licence is a held one),
 * computed live and sorted soonest-first.
 *
 * The active view lives in the URL (`?view=`), like every filter in this app, so a
 * pasted link opens the same face. Tabs are plain links rather than `setFilter` on
 * purpose: navigating to `?view=library` drops the other tab's filter params, which
 * would otherwise leak between views that give the same key different meanings.
 */
export function LicensesBrowser() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("view");
  const view: ViewKey = VIEWS.some((v) => v.key === requested)
    ? (requested as ViewKey)
    : "held";

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <nav aria-label="Licence views" className="flex flex-wrap items-center gap-1">
        {VIEWS.map((candidate) => (
          <Link
            key={candidate.key}
            href={candidate.key === "held" ? "/licenses" : `/licenses?view=${candidate.key}`}
            aria-current={view === candidate.key ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-[120ms]",
              view === candidate.key
                ? "bg-surface-selected text-ink"
                : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
            )}
          >
            {candidate.label}
          </Link>
        ))}
      </nav>

      {view === "held" ? (
        <HeldView />
      ) : view === "expiring" ? (
        <ExpiringView />
      ) : view === "requirements" ? (
        <RequirementsView />
      ) : (
        <LibraryView />
      )}
    </div>
  );
}
