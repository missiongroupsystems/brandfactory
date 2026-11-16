import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { usePublishDraft } from './use-publish-draft'

const draft = () =>
  renderHook(() =>
    usePublishDraft({
      format: 'carousel',
      hook: 'Pasta night',
      caption: 'Fresh pasta tonight.',
      linked: ['ig', 'fb', 'tt'],
      connected: ['ig', 'fb', 'tt'],
      selected: ['ig', 'tt'],
    }),
  )

describe('a send the core follows', () => {
  it('waits only for the accounts it sent to: one planned only beside them is shown as such', () => {
    const { result } = draft()
    act(() => result.current.send('now', ['ig']))
    expect(result.current.phase).toBe('publishing')
    expect(result.current.outcomes).toEqual({
      ig: { state: 'sending' },
      tt: { state: 'scheduled' },
    })
    act(() => result.current.follow({ ig: { state: 'live' } }))
    // TikTok got no job: it does not hold the page on Publishing.
    expect(result.current.phase).toBe('done')
  })

  it('starts no timer of its own: an account stays sending until its answer comes', async () => {
    const { result } = draft()
    act(() => result.current.send('now', ['ig', 'tt']))
    await act(async () => new Promise((r) => setTimeout(r, 3_500)))
    expect(result.current.outcomes).toEqual({ ig: { state: 'sending' }, tt: { state: 'sending' } })
    act(() =>
      result.current.follow({ ig: { state: 'live' }, tt: { state: 'failed', reason: 'No.' } }),
    )
    expect(result.current.phase).toBe('done')
  })
})
