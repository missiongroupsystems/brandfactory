"use client";

import type { ProseMirrorDoc } from "@brandfactory/shared";
import { EditorContent, useEditor } from "@tiptap/react";

import { defaultExtensions } from "@/editor/extensions";

/**
 * The guideline body editor — TipTap over the same extension set the Vite app uses.
 *
 * **A rich editor rather than a textarea, and the reason is data rather than polish.** A section
 * body is one stored ProseMirror document and two apps write it. A plain-text field would round
 * trip this page's own flattened blocks perfectly and destroy every bold run, link and heading
 * somebody wrote in `packages/web` — a silent loss on save, visible to nobody until they opened
 * the other app. `editor/extensions.ts` is the copy that keeps the two schemas identical.
 *
 * **`immediatelyRender: false` is required, not optional.** Next renders this tree on the server
 * and TipTap's default is to build the document during that first render, which produces markup
 * the client then disagrees with — a hydration error, on a page whose whole subtree is behind a
 * client-side auth boundary anyway.
 *
 * **The component is remounted rather than told to reload.** `content` is applied at creation
 * only, so the sheet keys this on the section being edited: arrival-and-reseed by `key` is the
 * pattern this package already uses for rows seeded from async data, and it is deliberately not
 * an effect calling `setContent` — `react-hooks/set-state-in-effect` is a real gate here and has
 * broken this build before.
 */
export function RichTextEditor({
  content,
  onChange,
  ariaLabel,
}: {
  content: ProseMirrorDoc;
  onChange: (doc: ProseMirrorDoc) => void;
  ariaLabel: string;
}) {
  const editor = useEditor({
    extensions: defaultExtensions,
    content: content as Record<string, unknown>,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // The focus ring lives on the wrapper, so the contenteditable itself must not draw a
        // second one inside it. This is the one place `outline-none` is correct in this package:
        // the ring is not being removed, it is being moved out one element.
        class: "rich-editor min-h-32 outline-none",
        "aria-label": ariaLabel,
      },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON() as ProseMirrorDoc),
  });

  return (
    /* `border-input` and the radius are `Textarea`'s, so a body field and a note field are the
       same control at a glance. The focus treatment is `focus-within` rather than the base
       layer's `:focus-visible`, because the thing that takes focus is the contenteditable inside
       and the boundary the reader sees is this box. */
    <div className="rounded-lg border border-input bg-surface px-3 py-2 text-sm text-ink transition-colors duration-[120ms] focus-within:border-border-focus hover:border-border-strong">
      <EditorContent editor={editor} />
    </div>
  );
}
