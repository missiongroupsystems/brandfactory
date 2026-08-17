"use client";

import {
  CONTENT_PILLARS_SECTION_LABEL,
  OVERVIEW_SECTION_LABEL,
  TLDR_SECTION_LABEL,
} from "@brandfactory/shared";
import { BookOpenIcon } from "lucide-react";

import { EmptyState, QueryError } from "@/components/layout/query-states";
import { Skeleton } from "@/components/ui/skeleton";

import { useBrandProfile } from "../hooks";
import {
  PILLARS_SECTION_LABEL,
  findSection,
  gridSections,
  isWritten,
  profileToMarkdown,
  sectionAnchor,
} from "../profile";
import { CopyButton } from "./copy-button";
import { ContentPillarsBand, PillarsBand } from "./pillars-band";
import { ProfileContents, type ContentsEntry } from "./profile-contents";
import { ProfileFooter } from "./profile-footer";
import { ProfileIdentity } from "./profile-identity";
import { RichText } from "./rich-text";
import { SectionCard } from "./section-card";
import { SectionHeading } from "./section-heading";
import { TldrBand } from "./tldr-band";
import { VisualIdentityBand } from "./visual-identity-band";

/**
 * The Brand Profile — the brand's homepage for a marketing team.
 *
 * Built from `docs/plans/brand-profiles.md`, Option A: a document with a contents rail, not a
 * launcher and not a record page. It answers "what is this brand?" in one scroll, in the order a
 * person reads it — who, then the brand in a paragraph, then what it stands on, then the long
 * version, then each facet, then the look.
 *
 * ---------------------------------------------------------------------------
 * What is real here and what is not
 * ---------------------------------------------------------------------------
 *
 * **The identity is real; every word of content is a fixture.** The name and the mark come from
 * the brand the shell actually holds, so the page agrees with the switcher that opened it; the
 * sections, colours and typefaces come from one of three samples (`fixtures.ts`). The badge in
 * the identity band and the line in the footer both say so, because a page that looked finished
 * is how somebody files a bug against a feature that was never wired.
 *
 * The seam is `useBrandProfile()` and nothing else. No component below takes anything but a
 * `BrandProfile`.
 *
 * ---------------------------------------------------------------------------
 * Why bands rather than a grid of equal cards
 * ---------------------------------------------------------------------------
 *
 * The four bands above the grid are the sections something *other than a person* also reads, or
 * that a person reads first: the TL;DR rides into every generation, the pillars are what every
 * other section ends up agreeing with, the Overview is the long answer. Giving them the page's
 * full measure and giving the rest two columns is the hierarchy — six identical cards would say
 * the brand's positioning and its typography rules are the same size of fact.
 *
 * `Values & positioning` therefore appears **once**: in the pillar band. `gridSections` excludes
 * it along with the other three banded labels.
 */
export function BrandProfileScreen({ brandId }: { brandId?: string }) {
  const { profile, brandName, isLoading, error } = useBrandProfile(brandId);

  if (error) return <QueryError error={error} />;
  if (isLoading) return <ProfileSkeleton />;
  if (!profile) {
    return (
      <EmptyState
        message="No brand selected"
        hint="This workspace has no brands yet. Create one from the switcher in the sidebar and its profile opens here."
      />
    );
  }

  const tldr = findSection(profile.sections, TLDR_SECTION_LABEL);
  const overview = findSection(profile.sections, OVERVIEW_SECTION_LABEL);
  const pillars = findSection(profile.sections, PILLARS_SECTION_LABEL);
  const contentPillars = findSection(profile.sections, CONTENT_PILLARS_SECTION_LABEL);
  const grid = gridSections(profile.sections);

  // Fixed anchors for the bands, derived ones for the grid. A band keeps its place in the rail
  // even when its section is absent — `#pillars` has to point somewhere on a brand that has not
  // written its values, because the empty state is what the reader is being sent to.
  const entries: ContentsEntry[] = [
    { anchor: "tldr", label: "TL;DR" },
    { anchor: "pillars", label: "Brand pillars" },
    ...(overview && isWritten(overview) ? [{ anchor: "overview", label: "Overview" }] : []),
    ...grid.map((section) => ({ anchor: sectionAnchor(section), label: section.label })),
    ...(contentPillars && isWritten(contentPillars)
      ? [{ anchor: "content-pillars", label: "What we post about" }]
      : []),
    ...(profile.colours.length > 0 || profile.typefaces.length > 0
      ? [{ anchor: "visual-identity", label: "Visual identity" }]
      : []),
  ];

  return (
    <div className="flex gap-8 px-6 py-6 md:px-8 md:py-8">
      <div className="flex min-w-0 flex-1 flex-col gap-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <ProfileIdentity profile={profile} brandName={brandName} />
          {/* The page's one primary action, and it works: whatever tool a marketer is using
              today, copy is how the brand reaches it. */}
          <CopyButton
            text={() => profileToMarkdown(profile)}
            label="Copy brand context"
            confirmation="Brand context copied as Markdown"
            className="rounded-lg border border-border-input px-3 py-1.5 text-ink-secondary"
          />
        </div>

        <TldrBand section={tldr} anchor="tldr" />

        <PillarsBand section={pillars} anchor="pillars" />

        {overview && isWritten(overview) ? (
          <section aria-labelledby="overview" className="flex flex-col gap-3">
            <SectionHeading id="overview" icon={BookOpenIcon} title="Overview" />
            <RichText blocks={overview.blocks} />
          </section>
        ) : null}

        {grid.length > 0 ? (
          /* Two-up, because these are read *against* each other — who the brand talks to beside
             how it sounds. One column below `md`, where a two-column card is a column of
             fragments. */
          <div className="grid gap-4 md:grid-cols-2">
            {grid.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>
        ) : null}

        <ContentPillarsBand section={contentPillars} anchor="content-pillars" />

        <VisualIdentityBand profile={profile} anchor="visual-identity" />

        <ProfileFooter profile={profile} />
      </div>

      <ProfileContents entries={entries} />
    </div>
  );
}

/**
 * The shape of the page, not a spinner.
 *
 * The identity band lands first in the real page too, so the skeleton puts a mark and a title
 * where they will be — a layout that does not jump when the data arrives.
 */
function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-8 px-6 py-6 md:px-8 md:py-8">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-64" />
        </div>
      </div>
      <Skeleton className="h-24 w-full max-w-[62ch] rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}
