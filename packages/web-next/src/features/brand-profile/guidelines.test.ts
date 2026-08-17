import type { BrandWithSections, ProseMirrorDoc, SectionId } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import { EMPTY_DOC, PRIORITY_STEP, mergeSection, removeSection, toWrites } from "./guidelines";

/**
 * Building the payload for a route that **deletes what it is not sent**.
 *
 * These are the assertions that stand between an edit to one section and the silent loss of the
 * other seven. Everything here is about the same property: the list that goes out is the list
 * that came in, changed in exactly one place.
 */

const body = (text: string): ProseMirrorDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const section = (id: string, label: string, priority: number, createdBy = "user") =>
  ({
    id,
    brandId: "b1",
    label,
    body: body(label),
    priority,
    createdBy,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-12T09:00:00.000Z",
  }) as unknown as BrandWithSections["sections"][number];

const brand = (...sections: BrandWithSections["sections"]) =>
  ({ id: "b1", sections }) as unknown as BrandWithSections;

const THREE = brand(
  section("s1", "TL;DR", 100),
  section("s2", "Voice & tone", 200, "agent"),
  section("s3", "Target audience", 300),
);

describe("toWrites", () => {
  it("carries every stored section, with its own author", () => {
    // The payload is the complete list, so a section this save merely re-sends must go back with
    // the author it arrived with. Synthesising `user` here is the bug that rewrote every
    // section's provenance on every unrelated save, one layer down.
    expect(toWrites(THREE)).toEqual([
      { id: "s1", label: "TL;DR", body: body("TL;DR"), priority: 100, createdBy: "user" },
      {
        id: "s2",
        label: "Voice & tone",
        body: body("Voice & tone"),
        priority: 200,
        createdBy: "agent",
      },
      {
        id: "s3",
        label: "Target audience",
        body: body("Target audience"),
        priority: 300,
        createdBy: "user",
      },
    ]);
  });
});

describe("mergeSection", () => {
  it("replaces one section and keeps every other untouched", () => {
    const writes = mergeSection(THREE, {
      id: "s2" as SectionId,
      label: "Voice & tone",
      body: body("Warm, short sentences."),
    });
    expect(writes).toHaveLength(3);
    expect(writes[1]?.body).toEqual(body("Warm, short sentences."));
    expect(writes[0]?.body).toEqual(body("TL;DR"));
    expect(writes[2]?.body).toEqual(body("Target audience"));
  });

  it("does not change the author of the section it edits", () => {
    const writes = mergeSection(THREE, {
      id: "s2" as SectionId,
      label: "Voice & tone",
      body: body("Edited by a person."),
    });
    // Editing an agent-drafted section does not make it a person's. The field records who
    // *produced* it, which is what keeps "these five came from research" legible afterwards.
    expect(writes[1]?.createdBy).toBe("agent");
  });

  it("keeps a renamed section's id, so a rename is not a delete and an insert", () => {
    const writes = mergeSection(THREE, {
      id: "s3" as SectionId,
      label: "Who we talk to",
      body: body("Target audience"),
    });
    expect(writes[2]).toMatchObject({ id: "s3", label: "Who we talk to" });
  });

  it("appends a new section after the last priority", () => {
    const writes = mergeSection(THREE, { label: "Messaging frameworks", body: EMPTY_DOC });
    expect(writes).toHaveLength(4);
    expect(writes[3]).toEqual({
      label: "Messaging frameworks",
      body: EMPTY_DOC,
      priority: 300 + PRIORITY_STEP,
      createdBy: "user",
    });
    // No id: the server inserts it. Sending one it does not know would be an update to nothing.
    expect(writes[3]).not.toHaveProperty("id");
  });

  it("gives the first section of an empty brand a priority", () => {
    const writes = mergeSection(brand(), { label: "TL;DR", body: EMPTY_DOC });
    expect(writes).toEqual([
      { label: "TL;DR", body: EMPTY_DOC, priority: PRIORITY_STEP, createdBy: "user" },
    ]);
  });
});

describe("removeSection", () => {
  it("drops one and keeps the rest, because omission is the delete", () => {
    const writes = removeSection(THREE, "s2" as SectionId);
    expect(writes.map((write) => write.id)).toEqual(["s1", "s3"]);
  });

  it("changes nothing when the id is not there", () => {
    // A double-submit, or a section deleted in another tab first. Sending the list unchanged is
    // right; sending an empty list because the id was not found would delete the brand's context.
    expect(removeSection(THREE, "gone" as SectionId)).toEqual(toWrites(THREE));
  });
});
