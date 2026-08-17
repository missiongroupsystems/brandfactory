import { contentPillarsDoc, type ProseMirrorDoc } from "@brandfactory/shared";
import { describe, expect, it } from "vitest";

import { docToBlocks } from "./blocks";

/**
 * The walk that turns a stored guideline body into the profile's blocks.
 *
 * Every case here is a claim `types.ts` or `blocks.ts` makes in prose — chiefly rule 1, that a
 * list is the document's own list and never a paragraph starting with a dash, and rule 2, that an
 * empty document is `[]` rather than a blank paragraph.
 */

const p = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

/**
 * A document literal, as `ProseMirrorDoc`.
 *
 * The cast is the honest one here: `ProseMirrorDoc` is `JsonValue`, which a heterogeneous object
 * literal does not satisfy structurally (an inferred `attrs?: undefined` is not JSON) — while
 * every shape below is exactly what the column holds. Surviving arbitrary JSON is the walk's
 * job, and one case here asserts it.
 */
const doc = (value: unknown): ProseMirrorDoc => value as ProseMirrorDoc;

describe("docToBlocks", () => {
  it("turns each paragraph into one block", () => {
    expect(docToBlocks(doc({ type: "doc", content: [p("One."), p("Two.")] }))).toEqual([
      { kind: "paragraph", text: "One." },
      { kind: "paragraph", text: "Two." },
    ]);
  });

  it("keeps a real list a list", () => {
    // The distinction `proseMirrorDocToPlainText` discards, and the one the pillar band is built
    // on. `contentPillarsDoc` is what the planner writes, so this is a real stored shape.
    expect(docToBlocks(contentPillarsDoc(["Sourcing", "Behind the pass"]))).toEqual([
      { kind: "list", items: ["Sourcing", "Behind the pass"] },
    ]);
  });

  it("does not read a typed dash as a list", () => {
    expect(docToBlocks(doc({ type: "doc", content: [p("- Sourcing")] }))).toEqual([
      { kind: "paragraph", text: "- Sourcing" },
    ]);
  });

  it("reads an ordered list and the snake_case spelling of one", () => {
    const value = doc({
      type: "doc",
      content: [{ type: "ordered_list", content: [{ type: "list_item", content: [p("First")] }] }],
    });
    expect(docToBlocks(value)).toEqual([{ kind: "list", items: ["First"] }]);
  });

  it("flattens a nested list into the enclosing one, in document order", () => {
    const value = doc({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                p("Warmth"),
                { type: "bulletList", content: [{ type: "listItem", content: [p("Never twee")] }] },
              ],
            },
            { type: "listItem", content: [p("Precision")] },
          ],
        },
      ],
    });
    // The parent's own text first, then what it contains — dropping the nested item would put
    // content on screen in one app and nowhere in the other.
    expect(docToBlocks(value)).toEqual([
      { kind: "list", items: ["Warmth", "Never twee", "Precision"] },
    ]);
  });

  it("maps an empty document to no blocks at all", () => {
    // Rule 2: the labelled-and-says-nothing state. A blank paragraph block would make an empty
    // section count as written, in the footer and in the fraction.
    expect(docToBlocks(doc({ type: "doc", content: [{ type: "paragraph" }] }))).toEqual([]);
    expect(docToBlocks(doc({ type: "doc", content: [] }))).toEqual([]);
    expect(docToBlocks(doc({ type: "doc" }))).toEqual([]);
  });

  it("survives a body that is not a document", () => {
    // `ProseMirrorDoc` is `JsonValue` at the wire — validity is the editor's promise, not the
    // schema's — so the walk must answer rather than throw on anything a row can hold.
    expect(docToBlocks(null)).toEqual([]);
    expect(docToBlocks("plain string")).toEqual([]);
    expect(
      docToBlocks(doc({ type: "doc", content: [{ type: "paragraph", content: "not an array" }] })),
    ).toEqual([]);
  });

  it("flattens a heading and a blockquote to prose", () => {
    const value = doc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "How we sound" }] },
        { type: "blockquote", content: [p("Never twee.")] },
      ],
    });
    // The view model has no headings. Keeping the words as prose is lossy about weight and
    // truthful about content; the stored document keeps the heading for the editor.
    expect(docToBlocks(value)).toEqual([
      { kind: "paragraph", text: "How we sound" },
      { kind: "paragraph", text: "Never twee." },
    ]);
  });

  it("joins a hard break with a space rather than running two sentences together", () => {
    const value = doc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Warm." },
            { type: "hardBreak" },
            { type: "text", text: "Never twee." },
          ],
        },
      ],
    });
    expect(docToBlocks(value)).toEqual([{ kind: "paragraph", text: "Warm. Never twee." }]);
  });

  it("keeps the marks' text and drops the marks", () => {
    const value = doc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "We are " },
            { type: "text", marks: [{ type: "bold" }], text: "not" },
            { type: "text", text: " a bistro." },
          ],
        },
      ],
    });
    expect(docToBlocks(value)).toEqual([{ kind: "paragraph", text: "We are not a bistro." }]);
  });
});
