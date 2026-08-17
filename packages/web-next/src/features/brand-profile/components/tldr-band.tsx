import { ZapIcon } from "lucide-react";

import { isWritten } from "../profile";
import type { ProfileSection } from "../types";
import { CopyButton } from "./copy-button";
import { EditButton } from "./edit-button";
import { SectionHeading } from "./section-heading";

/**
 * The TL;DR, at the largest type on the page.
 *
 * **It earns the hero slot for what it is, not for being first.** This is the section written to
 * ride into every generation as standing context — capped at ~400 characters for exactly that
 * reason (`TLDR_TARGET_MAX_CHARS`) — so it is the paragraph every agent reads on every request
 * forever. A marketer who knows that writes it carefully, which is why the line under the block
 * says so once, in small type, and why the block is bordered rather than being the first of six
 * identical cards.
 *
 * 18px at weight 400: the styleguide reserves weight 300 for ≥24px display moments, and this is
 * prose to be read rather than a headline.
 */
export function TldrBand({
  section,
  anchor,
  onEdit,
}: {
  section: ProfileSection | undefined;
  anchor: string;
  onEdit: () => void;
}) {
  const text = section?.blocks
    .filter((block) => block.kind === "paragraph")
    .map((block) => block.text)
    .join("\n\n");

  return (
    <section aria-labelledby={anchor} className="flex flex-col gap-3">
      <SectionHeading
        id={anchor}
        icon={ZapIcon}
        title="TL;DR"
        action={
          <div className="flex items-center gap-1">
            {text ? (
              <CopyButton text={() => text} label="Copy" confirmation="TL;DR copied" />
            ) : null}
            <EditButton onClick={onEdit} what="the TL;DR" />
          </div>
        }
      />

      {section && isWritten(section) && text ? (
        <>
          <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-e1">
            <p className="max-w-[62ch] text-[1.125rem] leading-[1.55] text-ink">{text}</p>
          </div>
          <p className="text-helper text-ink-tertiary">
            Rides into every generation as standing context.
          </p>
        </>
      ) : (
        /* Not a grey box. An empty TL;DR is the single most consequential gap a brand can have,
           so the empty state names the job rather than reporting the absence. */
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border-input px-5 py-4">
          <p className="max-w-[62ch] text-sm text-ink-secondary">
            Write the one paragraph every agent reads — what this brand is, who it is for, how it
            sounds. Three or four sentences is the whole job.
          </p>
          {/* The empty state names the job, so the control repeats the verb rather than saying
              "Edit". Nothing here opens a form that does nothing: this is the same sheet. */}
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-border-input px-2.5 py-1 text-helper text-ink-secondary hover:border-border-strong hover:text-ink"
          >
            Write the TL;DR
          </button>
        </div>
      )}
    </section>
  );
}
