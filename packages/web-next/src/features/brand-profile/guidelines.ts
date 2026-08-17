import type { BrandWithSections, ProseMirrorDoc, SectionId } from "@brandfactory/shared";

import type { GuidelineWrite } from "./api";

/**
 * Building the payload for `PATCH /brands/:id/guidelines`.
 *
 * ⚠️ **That route takes the brand's COMPLETE section list and deletes what is omitted.** Every
 * function here therefore starts from the whole list and returns the whole list. Nothing in this
 * file produces a subset, and nothing outside it should build a payload by hand — one call site
 * that forgets is one that silently deletes a brand's other seven sections.
 *
 * The sections handed in are the ones the *server* holds, fetched immediately before the write
 * (`useBrandProfileMutations.saveGuidelines`), not the ones in the SWR cache.
 */

/** Sparse integer ordering, as `guideline_sections.priority` already is. Room to insert between. */
export const PRIORITY_STEP = 100;

/** The editor's empty document — what TipTap produces for an untouched field. */
export const EMPTY_DOC: ProseMirrorDoc = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Every stored section as the write takes it.
 *
 * **`createdBy` rides along.** The payload is the complete list, so a section this save merely
 * re-sends must go back with the author it arrived with. Editing an agent-drafted section does
 * not make it a person's: the field records who *produced* the section, which is what keeps
 * "these five came from research" legible after somebody has tidied their prose.
 */
export function toWrites(brand: BrandWithSections): GuidelineWrite[] {
  return brand.sections.map((section) => ({
    id: section.id,
    label: section.label,
    body: section.body,
    priority: section.priority,
    createdBy: section.createdBy,
  }));
}

/**
 * The list with one section's label and body replaced, or — when `id` is absent — with a new
 * section appended.
 *
 * A new row takes a priority after the current maximum, so it lands at the end of the stored
 * order. Where it lands on the *page* is `gridSections`' business: the taxonomy orders the grid,
 * so a newly added `Voice & tone` appears among the others rather than at the bottom.
 */
export function mergeSection(
  brand: BrandWithSections,
  edit: { id?: SectionId; label: string; body: ProseMirrorDoc },
): GuidelineWrite[] {
  const writes = toWrites(brand);
  if (edit.id) {
    return writes.map((write) =>
      write.id === edit.id ? { ...write, label: edit.label, body: edit.body } : write,
    );
  }
  return [
    ...writes,
    {
      label: edit.label,
      body: edit.body,
      priority: nextPriority(writes),
      // The only place this app writes the literal. A person typed a label into a sheet.
      createdBy: "user",
    },
  ];
}

/** The list without one section. Omission *is* the delete — see the warning above. */
export function removeSection(brand: BrandWithSections, id: SectionId): GuidelineWrite[] {
  return toWrites(brand).filter((write) => write.id !== id);
}

function nextPriority(writes: readonly GuidelineWrite[]): number {
  if (writes.length === 0) return PRIORITY_STEP;
  return Math.max(...writes.map((write) => write.priority)) + PRIORITY_STEP;
}
