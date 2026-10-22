import { renderHook } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type * as Versions from './versions'

// On the core. Production's casa-vostra and temper share ids with demo brands, whose invented
// histories name demo people. The flag is read when the module loads.
let v: typeof Versions
beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_CORE_URL', 'https://core.test')
  vi.resetModules()
  v = await import('./versions')
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('voice versions on the core', () => {
  it('shows no demo history for casa-vostra or temper before the server sends one', () => {
    for (const id of ['casa-vostra', 'temper'] as const) {
      const { result } = renderHook(() => v.useVoiceVersions(id))
      expect(result.current).toEqual([])
    }
  })
})
