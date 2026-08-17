import {
  sectionKindForLabel,
  type BrandWithSections,
  type ResearchJobSummary,
} from "@brandfactory/shared";

import { docToBlocks } from "./blocks";
import type { BrandProfile, ProfileSection } from "./types";

/**
 * `BrandWithSections` + the brand's latest research run → the page's view model.
 *
 * The seam `types.ts` predicted, arrived. Everything below is one of the four things a mapper is
 * allowed to do — rename, flatten, truncate, or answer a rule — and each of the three rules it
 * applies is stated where it is applied, because none of them is visible from the component side.
 *
 * **The taxonomy is not re-decided here.** `sectionKindForLabel` is `shared`'s, and it is the same
 * function the planner and the rail already ask. A second opinion about whether `TLDR` is the
 * `TL;DR` is the drift `canonical-sections.ts` exists to prevent.
 */
export function toBrandProfile(
  brand: BrandWithSections,
  job: ResearchJobSummary | null | undefined,
): BrandProfile {
  return {
    id: brand.id,
    name: brand.name,
    description: brand.description,
    websiteUrl: brand.websiteUrl,
    updatedAt: businessDate(brand.updatedAt),
    sections: brand.sections.map(toProfileSection),
    // Assets are not read yet — see the note on these two fields in `types.ts`.
    colours: [],
    typefaces: [],
    research: researchDate(job),
  };
}

function toProfileSection(section: BrandWithSections["sections"][number]): ProfileSection {
  return {
    id: section.id,
    label: section.label,
    kind: sectionKindForLabel(section.label),
    blocks: docToBlocks(section.body),
    createdBy: section.createdBy,
    updatedAt: businessDate(section.updatedAt),
  };
}

/**
 * An instant → the business date it belongs to, as `types.ts` specifies.
 *
 * **Truncated, never parsed.** `formatDate` in `lib/format.ts` never constructs a `Date` for the
 * same reason: `new Date("2026-08-17T02:00:00Z")` is the 16th for every reader west of Greenwich,
 * so a section edited at two in the morning UTC would be dated "yesterday" in New York. The
 * server stores and sends UTC instants and the page shows a day; the honest conversion between
 * them is to take the day the server named.
 */
function businessDate(instant: string): string {
  return instant.slice(0, 10);
}

/**
 * The research line's date, or `null`.
 *
 * **Only a run that finished counts, and two statuses mean that.** `COMPLETED` is the obvious
 * one; `NO_FINDINGS` is the other, and it is ours rather than the vendor's — a completed run over
 * a one-page holding site, *a success that found nothing*. The footer says when research last
 * ran, which is true of both. `IN_PROGRESS`, `FAILED` and `CANCELLED` are not runs that ran.
 *
 * The status is tested as well as the field, so a `completedAt` on a failed row could never put
 * *"Research ran 12 August"* under a brand whose research produced nothing.
 */
const FINISHED: ReadonlySet<ResearchJobSummary["status"]> = new Set(["COMPLETED", "NO_FINDINGS"]);

function researchDate(job: ResearchJobSummary | null | undefined): { completedAt: string } | null {
  if (!job || !FINISHED.has(job.status) || !job.completedAt) return null;
  return { completedAt: businessDate(job.completedAt) };
}
