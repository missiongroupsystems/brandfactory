"use client";

import { SparklesIcon } from "lucide-react";
import * as React from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

import { sectionAnchor } from "../profile";
import type { ProfileSection } from "../types";
import { CopyButton } from "./copy-button";
import { RichText } from "./rich-text";

/** How many blocks show before the card offers to expand. */
const CLAMP_AT = 3;

/**
 * One context section — audience, voice, visual guidelines, or anything the brand invented.
 *
 * **The provenance chip is the point of this card over a plain block of prose.** `created_by` has
 * been on the row since 1.9.0 and is shown nowhere in the product; a marketer briefing a
 * freelancer needs to know which paragraphs a model drafted and nobody has approved yet. The chip
 * appears only for `agent` — "written by a person" is the unremarkable case and does not deserve
 * a badge on five cards out of six.
 *
 * **The clamp expands, it never truncates permanently.** A voice section cut off mid-rule is
 * worse than no voice section, because the reader believes they have read it. So the fold is
 * counted ("2 more paragraphs") and reversible, and the copy action always takes the whole thing.
 */
export function SectionCard({ section }: { section: ProfileSection }) {
  const [expanded, setExpanded] = React.useState(false);
  const anchor = sectionAnchor(section);
  const hidden = section.blocks.length - CLAMP_AT;
  const blocks = expanded ? section.blocks : section.blocks.slice(0, CLAMP_AT);

  return (
    <Card className="gap-3">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={anchor} className="scroll-mt-6 text-h3 text-ink">
            {section.label}
          </h2>
          {section.createdBy === "agent" ? (
            <span className="flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5 text-helper text-ink-secondary">
              <SparklesIcon aria-hidden className="size-3" />
              Drafted by research
            </span>
          ) : null}
          <CopyButton
            className="ml-auto"
            text={() => sectionToText(section)}
            label="Copy"
            confirmation={`${section.label} copied`}
          />
        </div>
        <span className="text-helper text-ink-tertiary">
          Updated {formatDate(section.updatedAt)}
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <RichText blocks={blocks} />
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="self-start rounded-lg text-helper text-ink-secondary underline underline-offset-2 hover:text-ink"
          >
            {expanded ? "Show less" : `Read all — ${hidden} more`}
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The section as plain text, for the clipboard. Lists keep their dashes. */
function sectionToText(section: ProfileSection): string {
  return section.blocks
    .map((block) =>
      block.kind === "paragraph" ? block.text : block.items.map((item) => `- ${item}`).join("\n"),
    )
    .join("\n\n");
}
