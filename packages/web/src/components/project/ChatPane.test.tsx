import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    render(<ChatPane projectId="p-1" messages={MESSAGES} onCapture={vi.fn()} />)

    expect(screen.getAllByRole('button', { name: 'Drag into brand context' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Send to brand context' })).toHaveLength(2)
  })

  // Outside a brand-context thread there is nowhere for a capture to land until
  // Phase E, and an affordance that does nothing is worse than none.
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
