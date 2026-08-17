import type { ProseMirrorDoc } from "@brandfactory/shared";

import type { ProfileBlock } from "./types";

/**
 * A stored guideline body → the profile's flattened blocks.
 *
 * **`shared`'s `proseMirrorDocToPlainText` cannot do this job**, and the reason is the whole
 * point of this file. That function flattens *every* block type to a string and joins them with
 * blank lines — a bullet list of four values and four paragraphs come out identical. Rule 1 in
 * `types.ts` is exactly the distinction it discards:
 *
 * > A `list` block is a real list in the document — a bullet or ordered list — and each item is
 * > one line. It is *not* a paragraph that happens to start with a dash.
 *
 * The pillar band depends on that: list items become cards and paragraphs stay prose, so a
 * flattener that could not tell them apart would promote *"we sit between the hotel dining rooms
 * and the seafood joints"* into a fourth pillar — a wrong statement rendered confidently.
 *
 * `shared`'s function keeps its callers: the planner's pillars and the description line both want
 * text, and neither cares where a line came from. This one is kept here rather than promoted
 * beside it for the reason that file gives for having moved *out* of `agent` — it moved when it
 * stopped having one consumer. Promote this when a second appears.
 *
 * **Marks are dropped, and nothing is lost by it.** Bold, links and headings survive in the
 * stored document; the view model has never carried them, and `SectionEditorSheet` edits the
 * document rather than these blocks. A round trip through the editor keeps every mark it never
 * shows.
 */

/** A node as it arrives off the wire: JSON, and validated as a document only by the editor. */
interface PMNode {
  type?: unknown;
  text?: unknown;
  content?: unknown;
}

/** Block-level nodes that flatten to one paragraph each. Both TipTap spellings of each. */
const PARAGRAPH_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "code_block",
  "codeBlock",
]);

const LIST_TYPES = new Set(["bullet_list", "bulletList", "ordered_list", "orderedList"]);

const LIST_ITEM_TYPES = new Set(["list_item", "listItem"]);

export function docToBlocks(doc: ProseMirrorDoc): ProfileBlock[] {
  const blocks: ProfileBlock[] = [];
  collect(doc, blocks);
  return blocks;
}

function collect(node: unknown, blocks: ProfileBlock[]): void {
  const children = childrenOf(node);
  if (!children) return;

  for (const child of children) {
    const type = typeOf(child);

    if (LIST_TYPES.has(type)) {
      // **A nested list flattens into the enclosing one**, in document order. The view model has
      // one level and the alternative to flattening is dropping the items — content on screen in
      // one app and absent in the other. One flat list of every item is lossy about *shape* only.
      const items = listItems(child)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (items.length > 0) blocks.push({ kind: "list", items });
      continue;
    }

    if (PARAGRAPH_TYPES.has(type)) {
      const text = nodeText(child).trim();
      // An empty paragraph is dropped rather than emitted, so an untouched editor document maps
      // to `[]` — rule 2's *labelled and says nothing*, which is what `isWritten` reads and what
      // the footer counts. A blank paragraph block would make an empty section read as written.
      if (text.length > 0) blocks.push({ kind: "paragraph", text });
      continue;
    }

    // Anything else — a horizontal rule, a table, an extension this app does not know — is
    // walked into rather than dropped, so a paragraph nested one level deeper still lands.
    collect(child, blocks);
  }
}

/** Every `listItem` under a list node, each as one line, including items of nested lists. */
function listItems(node: unknown): string[] {
  const items: string[] = [];
  walkItems(node, items);
  return items;
}

function walkItems(node: unknown, items: string[]): void {
  const children = childrenOf(node);
  if (!children) return;

  for (const child of children) {
    const type = typeOf(child);
    if (LIST_ITEM_TYPES.has(type)) {
      // The item's own text, then any list nested inside it, so document order is preserved:
      // a parent item is listed before the items it contains.
      items.push(directText(child));
      for (const grandchild of childrenOf(child) ?? []) {
        if (LIST_TYPES.has(typeOf(grandchild))) walkItems(grandchild, items);
      }
      continue;
    }
    if (LIST_TYPES.has(type)) walkItems(child, items);
  }
}

/** A list item's own text — its paragraphs, not the items of a list nested inside it. */
function directText(node: unknown): string {
  const children = childrenOf(node);
  if (!children) return "";
  return children
    .filter((child) => !LIST_TYPES.has(typeOf(child)))
    .map((child) => nodeText(child))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every text node beneath this one, concatenated.
 *
 * A `hardBreak` becomes a space: the destination is a `<p>`, where a newline collapses anyway,
 * and a break that vanished entirely would run two sentences together without one.
 */
function nodeText(node: unknown): string {
  if (node === null || typeof node !== "object") return "";
  const pm = node as PMNode;
  if (typeof pm.text === "string") return pm.text;
  const type = typeOf(node);
  if (type === "hard_break" || type === "hardBreak") return " ";
  return (childrenOf(node) ?? []).map((child) => nodeText(child)).join("");
}

function childrenOf(node: unknown): unknown[] | null {
  if (node === null || typeof node !== "object") return null;
  const content = (node as PMNode).content;
  return Array.isArray(content) ? content : null;
}

function typeOf(node: unknown): string {
  if (node === null || typeof node !== "object") return "";
  const type = (node as PMNode).type;
  return typeof type === "string" ? type : "";
}
