import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AgentMessage } from '@brandfactory/shared'
import {
  MessageCapture,
  buildCaptureTransfer,
  hasCaptureData,
  readCaptureTransfer,
  type CapturePayload,
} from './MessageCapture'

// jsdom has no `DataTransfer` constructor, so drag tests hand-roll the slice of
// the interface the capture path touches.
function fakeDataTransfer(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial }
  return {
    setData: vi.fn((format: string, value: string) => {
      store[format] = value
    }),
    getData: vi.fn((format: string) => store[format] ?? ''),
    get types() {
      return Object.keys(store)
    },
    effectAllowed: 'none',
    dropEffect: 'none',
    store,
  }
}

function message(role: AgentMessage['role'], content: string) {
  return { role, content }
}

describe('buildCaptureTransfer', () => {
  it('gives an assistant message both flavors', () => {
    const el = document.createElement('div')
    el.innerHTML = '<ul><li>One</li></ul>'
    expect(buildCaptureTransfer(message('assistant', '- One'), el)).toEqual({
      html: '<ul><li>One</li></ul>',
      text: '- One',
    })
  })

  // Correction 3. A user bubble is escaped plain text whose newlines are CSS
  // (`whitespace-pre-wrap`); parsed as HTML it collapses to one run-on
  // paragraph. ProseMirror splits plain text on newlines natively.
  it('gives a user message text only, even with a rendered element to hand', () => {
    const el = document.createElement('div')
    el.innerHTML = 'first line\nsecond line'
    expect(buildCaptureTransfer(message('user', 'first line\nsecond line'), el)).toEqual({
      text: 'first line\nsecond line',
    })
  })

  it('falls back to text when the assistant element is not mounted', () => {
    expect(buildCaptureTransfer(message('assistant', 'hello'), null)).toEqual({ text: 'hello' })
  })
})

describe('hasCaptureData / readCaptureTransfer', () => {
  it('recognises a capture drag by either flavor', () => {
    expect(hasCaptureData({ types: ['text/plain'] })).toBe(true)
    expect(hasCaptureData({ types: ['text/html'] })).toBe(true)
    expect(hasCaptureData({ types: ['Files'] })).toBe(false)
  })

  it('reads both flavors back, and null for an empty drag', () => {
    expect(
      readCaptureTransfer(fakeDataTransfer({ 'text/html': '<p>hi</p>', 'text/plain': 'hi' })),
    ).toEqual({ html: '<p>hi</p>', text: 'hi' })
    expect(readCaptureTransfer(fakeDataTransfer({ 'text/plain': 'hi' }))).toEqual({ text: 'hi' })
    expect(readCaptureTransfer(fakeDataTransfer())).toBeNull()
  })
})

function Harness({
  messageRole,
  content,
  onCapture,
}: {
  messageRole: AgentMessage['role']
  content: string
  onCapture: (p: CapturePayload) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={ref}>
        <p>{content}</p>
      </div>
      <MessageCapture
        message={message(messageRole, content)}
        contentRef={ref}
        onCapture={onCapture}
      />
    </>
  )
}

describe('MessageCapture drag', () => {
  it('writes both flavors for an assistant message', () => {
    render(<Harness messageRole="assistant" content="Warm, never cute." onCapture={vi.fn()} />)
    const dataTransfer = fakeDataTransfer()

    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag into brand context' }), {
      dataTransfer,
    })

    expect(dataTransfer.setData).toHaveBeenCalledWith('text/html', '<p>Warm, never cute.</p>')
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'Warm, never cute.')
    expect(dataTransfer.effectAllowed).toBe('copy')
  })

  it('writes text only for a user message', () => {
    render(<Harness messageRole="user" content="We never say 'synergy'." onCapture={vi.fn()} />)
    const dataTransfer = fakeDataTransfer()

    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag into brand context' }), {
      dataTransfer,
    })

    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', "We never say 'synergy'.")
    expect(dataTransfer.setData).not.toHaveBeenCalledWith('text/html', expect.anything())
  })
})

describe('MessageCapture click path', () => {
  // Drag-only is not keyboard-reachable, and both roles must be capturable.
  it('hands the same payload to onCapture, for both roles', async () => {
    const onCapture = vi.fn()
    const { unmount } = render(
      <Harness messageRole="assistant" content="Warm, never cute." onCapture={onCapture} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Send to brand context' }))
    expect(onCapture).toHaveBeenCalledWith({
      html: '<p>Warm, never cute.</p>',
      text: 'Warm, never cute.',
    })
    unmount()

    onCapture.mockClear()
    render(<Harness messageRole="user" content="Plainspoken." onCapture={onCapture} />)
    await userEvent.click(screen.getByRole('button', { name: 'Send to brand context' }))
    expect(onCapture).toHaveBeenCalledWith({ text: 'Plainspoken.' })
  })
})
