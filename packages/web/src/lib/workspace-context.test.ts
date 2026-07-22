import { describe, expect, it } from 'vitest'
import { resolveActiveWorkspaceId } from './workspace-context'

describe('resolveActiveWorkspaceId', () => {
  it('prefers the route workspace over storage', () => {
    expect(
      resolveActiveWorkspaceId({
        routeWorkspaceId: 'ws-route',
        storedId: 'ws-stored',
        workspaceIds: ['ws-route', 'ws-stored'],
      }),
    ).toBe('ws-route')
  })

  it('falls back to storage when the route has no workspace in scope', () => {
    expect(
      resolveActiveWorkspaceId({
        routeWorkspaceId: null,
        storedId: 'ws-stored',
        workspaceIds: ['ws-a', 'ws-stored'],
      }),
    ).toBe('ws-stored')
  })

  it('discards a stored id that is not in the workspace list', () => {
    expect(
      resolveActiveWorkspaceId({
        routeWorkspaceId: null,
        storedId: 'ws-stale',
        workspaceIds: ['ws-a', 'ws-b'],
      }),
    ).toBeNull()
  })

  it('returns null when the list is empty even if storage is set', () => {
    expect(
      resolveActiveWorkspaceId({
        routeWorkspaceId: null,
        storedId: 'ws-stored',
        workspaceIds: [],
      }),
    ).toBeNull()
  })
})
