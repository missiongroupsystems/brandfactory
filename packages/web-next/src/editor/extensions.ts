import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

/**
 * The TipTap extension set for this app's rich text.
 *
 * **It mirrors `packages/web/src/editor/proseMirrorSchema.ts` deliberately, and the two must stay
 * identical.** A guideline section's body is one stored ProseMirror document and *two apps write
 * it*: the Vite app's `BrandGuidelinesEditor` and this app's `SectionEditorSheet`. If one editor
 * knows a node the other does not, the second app opens that section, cannot represent the node,
 * and silently drops it on the next save — a data loss with nothing on screen to report it.
 *
 * That is also the reason there is no plainer editor here. A textarea would round-trip this app's
 * own flattened view model perfectly and destroy every bold run, link and heading a person wrote
 * in the other app.
 *
 * It is a copy rather than a shared module because the shared package is imported by the
 * **server**, and `@brandfactory/shared` is where the wire schema lives — pulling TipTap in there
 * would put an editor in the API's dependency tree to save eleven lines. Copy the file if the
 * other one changes; the whole of it is the configuration below.
 */
export const defaultExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
];
