"use client";

import {
  CONTENT_PILLARS_SECTION_LABEL,
  OVERVIEW_SECTION_LABEL,
  TLDR_SECTION_LABEL,
  type SectionId,
} from "@brandfactory/shared";
import { BookOpenIcon, PlusIcon } from "lucide-react";
import * as React from "react";

import { EmptyState, PageState, QueryError } from "@/components/layout/query-states";
import { Skeleton } from "@/components/ui/skeleton";

import { useBrandProfile } from "../hooks";
import {
  findSection,
  gridSections,
  isWritten,
  profileToMarkdown,
  sectionAnchor,
} from "../profile";
import type { ProfileSection } from "../types";
import { BrandIdentitySheet } from "./brand-identity-sheet";
import { CopyButton } from "./copy-button";
import { EditButton } from "./edit-button";
import { ContentPillarsBand, PillarsBand } from "./pillars-band";
import { ProfileContents, type ContentsEntry } from "./profile-contents";
import { ProfileFooter } from "./profile-footer";
import { ProfileIdentity } from "./profile-identity";
import { RichText } from "./rich-text";
import { SectionCard } from "./section-card";
import { SectionEditorSheet, type EditTarget } from "./section-editor-sheet";
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
 * Where the words come from
 * ---------------------------------------------------------------------------
 *
 * **The server.** `GET /brands/:id` answers the row and every guideline section; `map.ts`
 * flattens each ProseMirror body into blocks and `hooks.ts` is the only file that knows either
 * thing happened. No component below takes anything but a `BrandProfile`, which is what made the
 * integration a change to one file and three new ones rather than a rewrite of eleven.
 *
 * **Colours and typefaces are still empty**, because `BrandAsset` rows are not read yet — see
 * `types.ts`. `VisualIdentityBand` renders nothing rather than an empty state, which is the
 * correct behaviour for a brand that genuinely has neither and is why nothing here branches on it.
 *
 * ---------------------------------------------------------------------------
 * Why bands rather than a grid of equal cards
 * ---------------------------------------------------------------------------
 *
 * The bands above the grid are the sections something *other than a person* also reads, or that a
 * person reads first: the TL;DR rides into every generation, the Overview is the long answer.
 * Giving them the page's full measure and giving the rest two columns is the hierarchy — six
 * identical cards would say the brand's positioning and its typography rules are the same size of
 * fact.
 *
 * **`Brand pillars` is a band that reads nothing.** It used to render `Values & positioning`, and
 * that equation did not survive real data — see `pillars-band.tsx`. `Values & positioning` is now
 * an ordinary grid card under its own label, and the band is a stated placeholder holding its
 * place and its anchor.
 */
export function BrandProfileScreen({ brandId }: { brandId?: string }) {
  const { profile, source, isLoading, error } = useBrandProfile(brandId);

  /**
   * What the editor is pointed at, and whether it is open — **two pieces of state, deliberately.**
   *
   * A sheet's content survives its close: it stays mounted through the exit animation. Clearing
   * the target on close would therefore blank the panel while it is still on screen, and keying
   * the sheet on the target instead is the other trap — a key that changes mid-dismissal breaks
   * Base UI's dismissal and leaves the overlay eating clicks. So `open` closes it and `target`
   * stays until the next open replaces it.
   */
  const [target, setTarget] = React.useState<EditTarget | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [identityOpen, setIdentityOpen] = React.useState(false);

  const editSection = React.useCallback((next: EditTarget) => {
    setTarget(next);
    setEditorOpen(true);
  }, []);

  /**
   * Open the editor on a section named by *label*, whether or not the brand has it.
   *
   * The bands are addressed this way — `TldrBand` knows it renders the TL;DR and nothing about
   * row ids — and it is the same call that adds the section when it is absent: an empty TL;DR
   * band and a brand with no TL;DR row are the same gesture to the reader, and the sheet resolves
   * which of the two it is by whether an id came with it.
   */
  const editByLabel = React.useCallback(
    (label: string, section: ProfileSection | undefined) =>
      editSection({ sectionId: section?.id as SectionId | undefined, label }),
    [editSection],
  );

  if (error)
    return (
      <PageState>
        <QueryError error={error} />
      </PageState>
    );
  if (isLoading) return <ProfileSkeleton />;
  if (!profile) {
    return (
      <PageState>
        <EmptyState
          message="No brand selected"
          hint="This workspace has no brands yet. Create one from the switcher in the sidebar and its profile opens here."
        />
      </PageState>
    );
  }

  const tldr = findSection(profile.sections, TLDR_SECTION_LABEL);
  const overview = findSection(profile.sections, OVERVIEW_SECTION_LABEL);
  const contentPillars = findSection(profile.sections, CONTENT_PILLARS_SECTION_LABEL);
  const grid = gridSections(profile.sections);

  // Fixed anchors for the bands, derived ones for the grid. `#pillars` is unconditional because
  // the band it points at is unconditional — a placeholder that is on the page for every brand
  // and is what the reader is being sent to.
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
          <ProfileIdentity profile={profile} />

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <EditButton
              onClick={() => setIdentityOpen(true)}
              what="the brand"
              className="rounded-lg border border-border-input px-3 py-1.5 text-ink-secondary"
            />
            <button
              type="button"
              onClick={() => editSection({ label: "" })}
              className="flex items-center gap-1.5 rounded-lg border border-border-input px-3 py-1.5 text-helper text-ink-secondary transition-colors duration-[120ms] hover:border-border-strong hover:text-ink"
            >
              <PlusIcon aria-hidden className="size-3.5" />
              Add section
            </button>
            {/* The page's one primary action, and it worked before any of the rest did: whatever
                tool a marketer is using today, copy is how the brand reaches it. */}
            <CopyButton
              text={() => profileToMarkdown(profile)}
              label="Copy brand context"
              confirmation="Brand context copied as Markdown"
              className="rounded-lg border border-border-input px-3 py-1.5 text-ink-secondary"
            />
          </div>
        </div>

        <TldrBand
          section={tldr}
          anchor="tldr"
          onEdit={() => editByLabel(TLDR_SECTION_LABEL, tldr)}
        />

        <PillarsBand anchor="pillars" />

        {overview && isWritten(overview) ? (
          <section aria-labelledby="overview" className="flex flex-col gap-3">
            <SectionHeading
              id="overview"
              icon={BookOpenIcon}
              title="Overview"
              action={
                <EditButton
                  onClick={() => editByLabel(OVERVIEW_SECTION_LABEL, overview)}
                  what="the Overview"
                />
              }
            />
            <RichText blocks={overview.blocks} />
          </section>
        ) : null}

        {grid.length > 0 ? (
          /* Two-up, because these are read *against* each other — who the brand talks to beside
             how it sounds. One column below `md`, where a two-column card is a column of
             fragments. */
          <div className="grid gap-4 md:grid-cols-2">
            {grid.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                onEdit={() => editByLabel(section.label, section)}
              />
            ))}
          </div>
        ) : null}

        <ContentPillarsBand
          section={contentPillars}
          anchor="content-pillars"
          onEdit={() => editByLabel(CONTENT_PILLARS_SECTION_LABEL, contentPillars)}
        />

        <VisualIdentityBand profile={profile} anchor="visual-identity" />

        <ProfileFooter
          profile={profile}
          // The chip carries a label and the brand holds the row, so the lookup happens here
          // rather than in the footer: an empty section is one that exists, so this always
          // resolves and the sheet opens on an edit rather than on an add.
          onEdit={(label) => editByLabel(label, findSection(profile.sections, label))}
        />
      </div>

      <ProfileContents entries={entries} />

      <SectionEditorSheet
        target={target}
        source={source}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
      <BrandIdentitySheet profile={profile} open={identityOpen} onOpenChange={setIdentityOpen} />
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
