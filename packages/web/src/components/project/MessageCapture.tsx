import { BookmarkPlus, GripVertical } from 'lucide-react'
import type { AgentMessage } from '@brandfactory/shared'

/**
 * What a captured message carries across the drag (or the click path).
 *
 * Two flavors, because the drop target is a TipTap editor and ProseMirror
 * parses `text/html` through the editor's **own schema** — headings, lists,
 * bold and italic arrive as real nodes, and anything outside
 * `defaultExtensions` is coerced or dropped by the schema rather than by a
 * converter we would have to write and keep honest. `text` is both the
 * fallback and the only flavor a user message carries (see below).
 */
export interface CapturePayload {
  html?: string
  text: string
}

/**
 * Build the drag payload for one message bubble.
 *
 * Assistant messages get both flavors: their bubble is real HTML, rendered from
 * markdown by `ReactMarkdown`.
 *
 * User messages get **`text` only**. A user bubble is escaped plain text whose
 * newlines are rendered by CSS (`whitespace-pre-wrap`), so its `innerHTML` is a
 * single run of text with literal `\n`s in it — HTML parsing collapses those,
 * and a multi-line message would land as one run-on paragraph. Plain text is
 * strictly better here: ProseMirror splits it into paragraphs on newlines
 * natively, and we write no HTML anywhere, which keeps the no-converter
 * invariant clean.
 */
export function buildCaptureTransfer(
  message: Pick<AgentMessage, 'role' | 'content'>,
  renderedEl: HTMLElement | null,
): CapturePayload {
  if (message.role === 'assistant' && renderedEl) {
    return { html: renderedEl.innerHTML, text: message.content }
  }
  return { text: message.content }
}

/** Does a drag carry something a guideline section can accept? */
export function hasCaptureData(dataTransfer: Pick<DataTransfer, 'types'>): boolean {
  return dataTransfer.types.includes('text/plain') || dataTransfer.types.includes('text/html')
}

/** Read a payload back off a drop. Returns null when the drag carried nothing. */
export function readCaptureTransfer(
  dataTransfer: Pick<DataTransfer, 'getData'>,
): CapturePayload | null {
  const html = dataTransfer.getData('text/html')
  const text = dataTransfer.getData('text/plain')
  if (!html && !text) return null
  // A drag with html but no text still captures; the insert path falls back the
  // other way too.
  return { ...(html ? { html } : {}), text }
}

export interface MessageCaptureProps {
  message: Pick<AgentMessage, 'role' | 'content'>
  /** The bubble's rendered content element, for the assistant `text/html` flavor. */
  contentRef: React.RefObject<HTMLElement | null>
  /** The click path (C4). Rendered only when a capture target exists. */
  onCapture: (payload: CapturePayload) => void
}

/**
 * The capture affordances for one message bubble: a drag grip and a click
 * action. Lives here rather than in `ChatPane` so that stays a chat component.
 *
 * The **grip** carries the drag, not the bubble, so text selection inside the
 * bubble still works — Phase D's excerpt capture depends on that.
 *
 * The **click action** exists because drag-only is not keyboard-reachable and
 * trackpad drags across a split screen are miserable. Both are real `<button>`s.
 *
 * Rendered for **both roles**. The sharpest articulation of a brand is often the
 * founder's own offhand sentence, so this must not read as an agent-only
 * affordance.
 */
export function MessageCapture({ message, contentRef, onCapture }: MessageCaptureProps) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5 self-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          const payload = buildCaptureTransfer(message, contentRef.current)
          if (payload.html !== undefined) e.dataTransfer.setData('text/html', payload.html)
          e.dataTransfer.setData('text/plain', payload.text)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        title="Drag into brand context"
        aria-label="Drag into brand context"
        className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onCapture(buildCaptureTransfer(message, contentRef.current))}
        title="Send to brand context"
        aria-label="Send to brand context"
        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <BookmarkPlus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
