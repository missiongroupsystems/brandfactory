import { useCallback, useEffect, useState } from 'react'
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
  /**
   * Whether a drop target is on screen — true only in a brand-context thread,
   * where the right pane *is* the guidelines editor. Elsewhere capture goes
   * through a dialog (Phase E), which cannot be dragged into while closed, so
   * the grip would be a gesture with nowhere to land — and worse, the drag
   * would be accepted by whatever the right pane happens to be.
   */
  hasDropTarget?: boolean
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
export function MessageCapture({
  message,
  contentRef,
  onCapture,
  hasDropTarget,
}: MessageCaptureProps) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5 self-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
      {hasDropTarget ? (
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
      ) : null}
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

// ---------------------------------------------------------------------------
// Excerpt capture (Phase D)
//
// Whole-message capture over-captures: agent replies are chatty and the good
// line is usually one sentence. Everything below narrows the *source* of a
// capture to a selection; the payload shape and the insert path are the ones
// above, unchanged.
// ---------------------------------------------------------------------------

/**
 * Marks a bubble's rendered content element as capturable and records whose
 * message it is. Exported as a helper so the attribute name has one owner —
 * the hook below reads it back to decide which flavors a selection carries.
 */
export const CAPTURE_ROLE_ATTR = 'data-capture-role'

export function captureRoleProps(role: AgentMessage['role']) {
  return { [CAPTURE_ROLE_ATTR]: role }
}

/**
 * Build the payload for a selection inside one message bubble.
 *
 * The two flavors mirror `buildCaptureTransfer` exactly, and for the same
 * reason: an assistant bubble is real HTML, so `cloneContents()` serialized
 * keeps the list items and emphasis the selection actually covered, while a
 * user bubble is escaped plain text whose newlines are CSS — parsed as HTML a
 * multi-line excerpt collapses into one run (Correction 3). Still no
 * markdown→ProseMirror converter: the drop target's own schema does the
 * parsing.
 *
 * Returns null for an empty or whitespace-only selection, so callers have one
 * "nothing to capture" answer rather than several.
 */
export function buildSelectionCapture(
  range: Range,
  role: AgentMessage['role'],
): CapturePayload | null {
  const text = range.toString()
  if (!text.trim()) return null
  if (role !== 'assistant') return { text }
  const holder = document.createElement('div')
  holder.appendChild(range.cloneContents())
  return holder.innerHTML ? { html: holder.innerHTML, text } : { text }
}

/**
 * The D3 path: the browser's own drag of a selected range, which needs no
 * affordance from us — except inside a **user** bubble, where the UA writes a
 * `text/html` flavor of pre-wrapped plain text and reintroduces the exact
 * newline collapse Correction 3 exists to avoid. Dropping that flavor leaves
 * `text/plain`, which ProseMirror splits into paragraphs natively.
 *
 * Best-effort by design: the drag data store is writable during `dragstart`,
 * but if a browser declines the `clearData` we are no worse off than not
 * having tried. Assistant bubbles are left entirely alone — their native html
 * is the flavor we want.
 */
export function restrictSelectionDragToText(
  dataTransfer: Pick<DataTransfer, 'clearData' | 'setData'>,
  text: string,
): void {
  if (!text.trim()) return
  dataTransfer.clearData('text/html')
  dataTransfer.setData('text/plain', text)
}

export interface SelectionCaptureState {
  payload: CapturePayload
  /** Viewport coordinates of the selection, for the floating affordance. */
  anchor: { top: number; left: number }
}

function captureHostOf(node: Node | null): HTMLElement | null {
  const el =
    node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : (node?.parentElement ?? null)
  return el?.closest<HTMLElement>(`[${CAPTURE_ROLE_ATTR}]`) ?? null
}

function roleOf(host: HTMLElement): AgentMessage['role'] {
  return host.getAttribute(CAPTURE_ROLE_ATTR) === 'assistant' ? 'assistant' : 'user'
}

/**
 * Track the current text selection and report it when it is capturable: a
 * non-collapsed range lying inside a single message bubble within `container`.
 *
 * The payload is **snapshotted here**, not read at click time, so the button
 * cannot hand up something other than the words it was raised over. It is not
 * on its own enough to survive a lost selection — losing one unmounts the
 * affordance — which is why `SelectionCaptureButton` prevents its own
 * mousedown default.
 */
export function useSelectionCapture(
  container: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): { capture: SelectionCaptureState | null; dismiss: () => void } {
  const [capture, setCapture] = useState<SelectionCaptureState | null>(null)

  useEffect(() => {
    if (!enabled) return

    const refresh = () => {
      const root = container.current
      const selection = document.getSelection()
      if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        setCapture(null)
        return
      }
      const range = selection.getRangeAt(0)
      // One bubble, or nothing. `commonAncestorContainer` climbs out of the
      // bubble the instant a selection spans two of them, so this single check
      // rejects cross-bubble and outside-the-chat selections alike — no
      // anchor/focus comparison needed.
      const host = captureHostOf(range.commonAncestorContainer)
      if (!host || !root.contains(host)) {
        setCapture(null)
        return
      }
      const payload = buildSelectionCapture(range, roleOf(host))
      if (!payload) {
        setCapture(null)
        return
      }
      // The affordance is viewport-positioned, so a selection scrolled out of
      // the chat must take it with them rather than leave it floating over the
      // header.
      const rect = range.getBoundingClientRect()
      const bounds = root.getBoundingClientRect()
      if (rect.bottom < bounds.top || rect.top > bounds.bottom) {
        setCapture(null)
        return
      }
      setCapture({ payload, anchor: { top: rect.top, left: rect.left + rect.width / 2 } })
    }

    document.addEventListener('selectionchange', refresh)
    // `scroll` does not bubble, so the chat's own scroll container is only
    // reachable in the capture phase.
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('resize', refresh)
    return () => {
      document.removeEventListener('selectionchange', refresh)
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('resize', refresh)
    }
  }, [container, enabled])

  // Collapsing the selection is the acknowledgement: the excerpt landed, and
  // the affordance goes with it. Re-selecting to capture the same words twice
  // costs two seconds, which the plan already prices in for double-capture.
  const dismiss = useCallback(() => {
    document.getSelection()?.removeAllRanges()
    setCapture(null)
  }, [])

  // Derived rather than cleared in the effect: with no listeners attached,
  // whatever `capture` last held is stale by definition, and deriving keeps the
  // disabled case out of the state machine entirely.
  return { capture: enabled ? capture : null, dismiss }
}

export interface SelectionCaptureButtonProps {
  capture: SelectionCaptureState
  onCapture: (payload: CapturePayload) => void
  onDismiss: () => void
}

/**
 * The floating "Add to brand context" affordance, anchored above the
 * selection. One instance per chat pane — a text selection is a document-level
 * singleton, not a per-bubble one.
 */
export function SelectionCaptureButton({
  capture,
  onCapture,
  onDismiss,
}: SelectionCaptureButtonProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: capture.anchor.top - 8,
        left: capture.anchor.left,
        transform: 'translate(-50%, -100%)',
      }}
      className="z-50"
    >
      <button
        type="button"
        // Load-bearing, not polish. A plain mousedown collapses the selection,
        // which fires `selectionchange`, which unmounts this button — before
        // its own click can land. Preventing the default keeps the selection,
        // and the button, alive long enough to be pressed.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          onCapture(capture.payload)
          onDismiss()
        }}
        className="flex items-center gap-1 rounded-lg border bg-popover px-2 py-1 text-xs font-medium whitespace-nowrap text-popover-foreground shadow-elevation-2 hover:bg-accent"
      >
        <BookmarkPlus className="size-3.5" aria-hidden="true" />
        Add to brand context
      </button>
    </div>
  )
}
