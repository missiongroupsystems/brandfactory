import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AgentMessage } from '@brandfactory/shared'
import { ChatPane } from './ChatPane'

vi.mock('@/agent/useAgentChat', () => ({
  useAgentChat: () => ({ status: 'idle', send: vi.fn(), stop: vi.fn() }),
}))

function msg(id: string, role: AgentMessage['role'], content: string): AgentMessage {
  return { kind: 'message', id, role, content }
}

const MESSAGES = [
  msg('m-1', 'user', 'Who is this for?'),
  msg('m-2', 'assistant', 'Founders who hate agencies.'),
]

describe('ChatPane capture affordances', () => {
  // Both roles are capturable — often the sharpest articulation of a brand is
  // the founder's own offhand sentence.
  it('offers capture on every message when a target exists', () => {
    render(<ChatPane projectId="p-1" messages={MESSAGES} onCapture={vi.fn()} hasDropTarget />)

    expect(screen.getAllByRole('button', { name: 'Drag into brand context' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Send to brand context' })).toHaveLength(2)
  })

  // Phase E: every thread can capture, but only a brand-context thread has the
  // editor on screen. A drag with no visible target is not merely useless —
  // whatever the right pane happens to be would accept the drop.
  it('offers the click path but no drag when the target is not on screen', () => {
    render(<ChatPane projectId="p-1" messages={MESSAGES} onCapture={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Drag into brand context' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Send to brand context' })).toHaveLength(2)
  })

  // `ChatPane` knows nothing about brands: a caller with no destination at all
  // gets no affordances.
  it('offers none when no target exists', () => {
    render(<ChatPane projectId="p-1" messages={MESSAGES} />)

    expect(screen.queryByRole('button', { name: 'Drag into brand context' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send to brand context' })).toBeNull()
    // The messages themselves are unaffected.
    expect(screen.getByText('Who is this for?')).toBeTruthy()
  })

  it('passes the clicked message up, distinguishing the two roles', async () => {
    const onCapture = vi.fn()
    render(<ChatPane projectId="p-1" messages={MESSAGES} onCapture={onCapture} />)

    const buttons = screen.getAllByRole('button', { name: 'Send to brand context' })
    await userEvent.click(buttons[0] as HTMLElement)
    // A user message carries no html flavor (Correction 3).
    expect(onCapture).toHaveBeenCalledWith({ text: 'Who is this for?' })

    await userEvent.click(buttons[1] as HTMLElement)
    expect(onCapture).toHaveBeenLastCalledWith({
      html: '<p>Founders who hate agencies.</p>',
      text: 'Founders who hate agencies.',
    })
  })
})

// ---------------------------------------------------------------------------
// Excerpt capture (Phase D)
// ---------------------------------------------------------------------------

// jsdom has no layout, so every element measures 0×0 and `Range` has no
// `getBoundingClientRect` at all. Both are stubbed, because the affordance
// hides a selection that has been scrolled out of the pane and that guard needs
// two coherent rectangles to compare.
function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 40,
    right: 200,
    width: 160,
    height: bottom - top,
    x: 40,
    y: top,
    toJSON: () => ({}),
  }
}

const CAPTURE_LABEL = 'Add to brand context'

describe('ChatPane excerpt capture', () => {
  const originalElementRect = HTMLElement.prototype.getBoundingClientRect
  const originalRangeRect = Range.prototype.getBoundingClientRect

  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = () => rect(0, 600)
    Range.prototype.getBoundingClientRect = () => rect(120, 132)
  })

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalElementRect
    Range.prototype.getBoundingClientRect = originalRangeRect
    document.getSelection()?.removeAllRanges()
  })

  /** Select a character range within one text node, or across two. */
  function select(start: [Node, number], end: [Node, number] = start) {
    const range = document.createRange()
    range.setStart(start[0], start[1])
    range.setEnd(end[0], end[1])
    const selection = document.getSelection()
    if (!selection) throw new Error('no selection')
    selection.removeAllRanges()
    selection.addRange(range)
    // jsdom does fire `selectionchange`, but queues it as a task — so dispatch
    // synchronously to assert without awaiting a tick.
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
    })
  }

  function textOf(content: string): Node {
    const node = screen.getByText(content).firstChild
    if (!node) throw new Error(`no text node under "${content}"`)
    return node
  }

  it('offers the excerpt of an assistant message that was actually selected', async () => {
    const onCapture = vi.fn()
    render(<ChatPane projectId="p-1" messages={MESSAGES} onCapture={onCapture} />)

    // "hate agencies." out of "Founders who hate agencies."
    select([textOf('Founders who hate agencies.'), 13], [textOf('Founders who hate agencies.'), 27])
    await userEvent.click(screen.getByRole('button', { name: CAPTURE_LABEL }))

    expect(onCapture).toHaveBeenCalledWith({ html: 'hate agencies.', text: 'hate agencies.' })
  })

  it('offers a user excerpt as text only', async () => {
    const onCapture = vi.fn()
    render(<ChatPane projectId="p-1" messages={MESSAGES} onCapture={onCapture} />)

    select([textOf('Who is this for?'), 0], [textOf('Who is this for?'), 3])
    await userEvent.click(screen.getByRole('button', { name: CAPTURE_LABEL }))

    expect(onCapture).toHaveBeenCalledWith({ text: 'Who' })
  })

  // Both halves of "this selection belongs to no single message".
  it('offers nothing for a selection that spans two bubbles or sits outside them', () => {
    render(<ChatPane projectId="p-1" messages={MESSAGES} onCapture={vi.fn()} />)

    select([textOf('Who is this for?'), 0], [textOf('Founders who hate agencies.'), 8])
    expect(screen.queryByRole('button', { name: CAPTURE_LABEL })).toBeNull()

    select([textOf('Chat'), 0], [textOf('Chat'), 4])
    expect(screen.queryByRole('button', { name: CAPTURE_LABEL })).toBeNull()
  })

  // The affordance is viewport-positioned, so a selection scrolled out of the
  // pane has to take it along rather than leave it floating over the header.
  it('offers nothing for a selection scrolled out of the pane', () => {
    render(<ChatPane projectId="p-1" messages={MESSAGES} onCapture={vi.fn()} />)
    Range.prototype.getBoundingClientRect = () => rect(880, 892) // pane is 0–600

    select([textOf('Founders who hate agencies.'), 0], [textOf('Founders who hate agencies.'), 8])

    expect(screen.queryByRole('button', { name: CAPTURE_LABEL })).toBeNull()
  })

  it('offers nothing when the thread has no capture target', () => {
    render(<ChatPane projectId="p-1" messages={MESSAGES} />)

    select([textOf('Founders who hate agencies.'), 0], [textOf('Founders who hate agencies.'), 8])

    expect(screen.queryByRole('button', { name: CAPTURE_LABEL })).toBeNull()
  })

  // The cut criterion this phase was told to watch for, pinned: a plain
  // mousedown collapses the selection, which unmounts this very button before
  // its click can land. Preventing the default is what keeps the affordance
  // clickable at all — not styling.
  it('does not let its own mousedown collapse the selection', () => {
    render(<ChatPane projectId="p-1" messages={MESSAGES} onCapture={vi.fn()} />)

    select([textOf('Founders who hate agencies.'), 0], [textOf('Founders who hate agencies.'), 8])

    expect(fireEvent.mouseDown(screen.getByRole('button', { name: CAPTURE_LABEL }))).toBe(false)
  })

  // Capturing acknowledges itself by taking the selection with it, which is
  // also what keeps the affordance from lingering over stale words.
  it('clears the selection once the excerpt is captured', async () => {
    render(<ChatPane projectId="p-1" messages={MESSAGES} onCapture={vi.fn()} />)

    select([textOf('Founders who hate agencies.'), 0], [textOf('Founders who hate agencies.'), 8])
    await userEvent.click(screen.getByRole('button', { name: CAPTURE_LABEL }))

    expect(document.getSelection()?.toString()).toBe('')
    expect(screen.queryByRole('button', { name: CAPTURE_LABEL })).toBeNull()
  })
})
