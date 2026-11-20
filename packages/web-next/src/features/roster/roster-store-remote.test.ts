import { describe, expect, it, vi } from 'vitest'

import type * as Remote from '@/lib/remote'

// On the core, with a roster read that the test answers by hand.
const gate = vi.hoisted(() => ({
  answers: [] as Array<(value: unknown) => void>,
  sent: [] as Array<[string, string, unknown]>,
}))
vi.mock('@/lib/remote', async (original) => ({
  ...(await original<typeof Remote>()),
  remote: true,
  CORE_URL: 'https://core.test',
  onAccount: () => () => undefined,
  settled: async () => undefined,
  push: (_brand: string, send: () => Promise<unknown>) => void send(),
  request: (method: string, path: string, body?: unknown) => {
    gate.sent.push([method, path, body])
    if (method === 'GET') return new Promise((resolve) => gate.answers.push(resolve))
    return Promise.resolve({})
  },
}))

const { loadRoster, nameHandle, useProfiles } = await import('./roster-store')
const { renderHook } = await import('@testing-library/react')

describe('the roster on the core', () => {
  it('keeps a name given while an older read of the roster was on its way, and reads again', async () => {
    const first = loadRoster()
    await vi.waitFor(() => expect(gate.answers).toHaveLength(2))
    // A name is given while the read is out; the read then answers what was stored before.
    nameHandle('co-a', '@CasaNostraSG', 'Casa Nostra')
    gate.answers.shift()!([])
    gate.answers.shift()!([
      { orgId: 'co-a', handle: 'casanostrasg', name: null, picture: null, followers: null },
    ])
    // The old answer is not shown: the name stays, and the roster is read again behind it.
    const { result } = renderHook(() => useProfiles())
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current[0]?.name).toBe('Casa Nostra')
    await vi.waitFor(() => expect(gate.answers).toHaveLength(2))
    expect(gate.sent.filter(([m]) => m === 'PUT')).toEqual([
      ['PUT', '/roster/profiles/co-a/casanostrasg', { name: 'Casa Nostra' }],
    ])
    gate.answers.shift()!([])
    gate.answers.shift()!([
      {
        orgId: 'co-a',
        handle: 'casanostrasg',
        name: 'Casa Nostra',
        picture: null,
        followers: null,
      },
    ])
    await first
    expect(result.current).toEqual([
      {
        orgId: 'co-a',
        handle: 'casanostrasg',
        name: 'Casa Nostra',
        picture: null,
        followers: null,
      },
    ])
  })
})
