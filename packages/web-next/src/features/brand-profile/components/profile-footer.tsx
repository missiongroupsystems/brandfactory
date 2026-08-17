import { formatDate } from "@/lib/format";

import { completeness } from "../profile";
import type { BrandProfile } from "../types";

/**
 * How much of this brand is written down, and where the words came from.
 *
 * **Soft on purpose.** No percentage, no red, no "incomplete" — the Vite app's `GuidelineMeter`
 * made that call and it holds here: a half-written brand is a normal brand, and a page that
 * scolds a brand for arriving as a rough idea is a page nobody opens twice. The dots are a muted
 * indicator, and the unwritten rows are listed by name because a name is something you can act
 * on and a fraction is not.
 *
 * **`0 of 0` is never rendered.** A brand with no sections at all reads "No brand context yet" —
 * the fraction would invite the reader to go looking for the rows it counts, and there are none.
 * `brandContextState` states the same rule at the shared layer.
 */
export function ProfileFooter({ profile }: { profile: BrandProfile }) {
  const state = completeness(profile.sections);

  return (
    <footer className="flex flex-col gap-3 border-t border-border-subtle pt-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {state.total > 0 ? (
          <>
            <span aria-hidden className="flex items-center gap-1">
              {Array.from({ length: state.total }, (_, index) => (
                <span
                  key={index}
                  className={
                    index < state.written
                      ? "size-1.5 rounded-full bg-ink-tertiary"
                      : "size-1.5 rounded-full border border-border-strong"
                  }
                />
              ))}
            </span>
            <span className="text-helper text-ink-secondary">
              {state.written} of {state.total} sections written
            </span>
          </>
        ) : (
          <span className="text-helper text-ink-secondary">No brand context yet</span>
        )}

        {profile.research ? (
          <>
            <span aria-hidden className="text-ink-tertiary">
              ·
            </span>
            <span className="text-helper text-ink-secondary">
              Research ran {formatDate(profile.research.completedAt)}
            </span>
          </>
        ) : null}
      </div>

      {state.unwritten.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-helper text-ink-tertiary">Still empty:</span>
          {state.unwritten.map((label) => (
            <span
              key={label}
              className="rounded-lg border border-dashed border-border-input px-2 py-0.5 text-helper text-ink-secondary"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      {/* The honest footer note. These chips will open the editor on that section once
          `EditGuidelinesDialog` comes across; until then they are a list, and saying so beats a
          button that does nothing. */}
      <p className="text-helper text-ink-tertiary">
        This page renders sample content. Editing, and the brand&apos;s real guidelines, arrive
        with the integration.
      </p>
    </footer>
  );
}
