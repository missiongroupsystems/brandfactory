import { ExternalLinkIcon } from "lucide-react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { displayHost } from "@/lib/website-url";

import { completeness } from "../profile";
import type { BrandProfile } from "../types";

/**
 * The first band: whose page is this.
 *
 * One question, deliberately — mark, name, where it lives, when it last changed, and the colours.
 * `packages/web`'s `BrandIdentity` answers the same question and carries no counts for the reason
 * this one carries only the section fraction: every number has a home further down the page, and
 * a stats strip here restates them a scroll early with nowhere to act on them.
 *
 * **The palette is here rather than only in the Visual identity band**, which is 1.8.0's decision
 * re-taken in a wider column: the strip is the fastest possible answer to "is this the right
 * brand?", and it costs one row. The values and their names stay in the band below, where there
 * is room to copy them.
 *
 * **The sample badge is not decoration.** Every word under this band is fixture content, and a
 * page that looked finished is how somebody files a bug against a feature that was never wired —
 * the same honesty the sidebar's `Mock` badge carries for the Operations Hub screens.
 */
export function ProfileIdentity({ profile, brandName }: { profile: BrandProfile; brandName?: string }) {
  // The name the shell holds, when it holds one. See `useBrandProfile` — the identity is real so
  // the page is coherent with the switcher; everything below it is the sample.
  const name = brandName ?? profile.name;
  const state = completeness(profile.sections);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-4">
        <BrandMark name={name} seed={profile.id} size="lg" />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1 text-ink">{name}</h1>
            <Badge variant="outline">Sample content</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-helper text-ink-secondary">
            {profile.websiteUrl ? (
              <>
                <a
                  href={profile.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-ink hover:text-brand hover:underline"
                >
                  {displayHost(profile.websiteUrl)}
                  <ExternalLinkIcon aria-hidden className="size-3" />
                </a>
                <span aria-hidden className="text-ink-tertiary">
                  ·
                </span>
              </>
            ) : null}
            <span>Updated {formatDate(profile.updatedAt)}</span>
            <span aria-hidden className="text-ink-tertiary">
              ·
            </span>
            {/* Never `0 of 0`, which invites the reader to look for rows that do not exist —
                `brandContextState`'s rule, kept here because the footer states the same fact. */}
            <span>
              {state.total === 0
                ? "No brand context yet"
                : `${state.written} of ${state.total} sections written`}
            </span>
          </div>
        </div>
      </div>

      {profile.colours.length > 0 ? (
        <div aria-hidden className="flex flex-wrap gap-1.5">
          {profile.colours.map((colour) => (
            <span
              key={colour.value}
              title={`${colour.label} — ${colour.value}`}
              style={{ backgroundColor: colour.value }}
              className="h-6 w-12 rounded-md border border-border-subtle"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
