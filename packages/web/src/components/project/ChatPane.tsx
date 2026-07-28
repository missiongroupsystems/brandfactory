import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Square } from 'lucide-react'
import type { AgentMessage } from '@brandfactory/shared'
import { useAgentChat } from '@/agent/useAgentChat'
import {
  MessageCapture,
  SelectionCaptureButton,
  captureRoleProps,
  restrictSelectionDragToText,
  useSelectionCapture,
  type CapturePayload,
} from '@/components/project/MessageCapture'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ChatPaneProps {
  projectId: string
  messages: AgentMessage[]
  /**
   * Where a captured message goes. Every thread supplies one now: a
   * brand-context thread inserts into its visible editor, and every other
   * thread opens the guidelines dialog with the content staged (Phase E).
   * Optional because `ChatPane` knows nothing about brands — a caller with no
   * destination gets no affordances, rather than a gesture that lands nowhere.
   */
  onCapture?: (payload: CapturePayload) => void
  /** Whether the capture destination is a *visible* drop target. See `MessageCapture`. */
  hasDropTarget?: boolean
}

export function ChatPane({ projectId, messages, onCapture, hasDropTarget }: ChatPaneProps) {
  const { status, send, stop } = useAgentChat(projectId)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedToBottomRef = useRef(true)
  // Excerpt capture (Phase D). Scoped to the message list, so a selection in
  // the other pane — the guidelines editor, in a brand-context thread — never
  // raises a chat affordance.
  const { capture, dismiss } = useSelectionCapture(scrollRef, Boolean(onCapture))

  // Autoscroll to bottom when new messages arrive, unless the user has
  // scrolled up. `scrollHeight - scrollTop - clientHeight < 32` is "near the
  // bottom"; we only autoscroll while pinned there.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinnedToBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [messages, status])

  const submit = () => {
    const text = draft
    if (!text.trim() || status === 'streaming') return
    setDraft('')
    void send(text)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-3 text-sm font-medium">Chat</div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          pinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32
        }}
        className="flex-1 overflow-y-auto p-4"
      >
        {messages.length === 0 && status === 'idle' ? (
          <p className="text-sm text-muted-foreground">
            Start a conversation to ideate with the agent. It has your brand context loaded.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onCapture={onCapture}
                hasDropTarget={hasDropTarget}
              />
            ))}
            {status === 'streaming' ? (
              <div className="text-xs text-muted-foreground">Thinking…</div>
            ) : null}
          </div>
        )}
      </div>
      <div className="border-t p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl+Enter submits; Enter inserts a newline.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Message the agent…  (⌘+Enter to send)"
            rows={2}
            className="min-h-[44px] flex-1 resize-y rounded-lg border border-input bg-surface-base p-2 text-sm outline-none focus-visible:border-[var(--border-focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
            disabled={status === 'streaming'}
          />
          {status === 'streaming' ? (
            <Button type="button" variant="outline" size="icon" onClick={stop}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
      {onCapture && capture ? (
        <SelectionCaptureButton capture={capture} onCapture={onCapture} onDismiss={dismiss} />
      ) : null}
    </div>
  )
}

function MessageBubble({
  message,
  onCapture,
  hasDropTarget,
}: {
  message: AgentMessage
  onCapture?: (payload: CapturePayload) => void
  hasDropTarget?: boolean
}) {
  const isUser = message.role === 'user'
  // The assistant flavor of a capture is this element's rendered HTML, which is
  // why the ref sits on the content div and not the bubble (the bubble's padding
  // and background are chrome, not content).
  const contentRef = useRef<HTMLDivElement>(null)

  const capture = onCapture ? (
    <MessageCapture
      message={message}
      contentRef={contentRef}
      onCapture={onCapture}
      hasDropTarget={hasDropTarget}
    />
  ) : null

  return (
    <div className={cn('group flex items-start gap-1', isUser ? 'justify-end' : 'justify-start')}>
      {/* The capture controls sit in the gutter on the outside of the bubble, so
          they never reflow its text. */}
      {isUser && capture}
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm',
          // The accent is budgeted (§4) — it does not get spent on every user
          // bubble. Selected-surface tint carries "this one is mine" instead.
          isUser ? 'bg-surface-selected text-foreground' : 'bg-muted text-foreground',
        )}
      >
        {isUser ? (
          <div
            ref={contentRef}
            {...captureRoleProps(message.role)}
            // A native drag of a selection in here would carry the UA's own
            // `text/html` — pre-wrapped plain text, whose newlines collapse on
            // parse (Correction 3). Strip it back to the flavor we want.
            onDragStart={(e) =>
              restrictSelectionDragToText(e.dataTransfer, document.getSelection()?.toString() ?? '')
            }
            className="whitespace-pre-wrap"
          >
            {message.content}
          </div>
        ) : (
          <div
            ref={contentRef}
            {...captureRoleProps(message.role)}
            className="prose prose-sm max-w-none break-words dark:prose-invert [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
      {!isUser && capture}
    </div>
  )
}
