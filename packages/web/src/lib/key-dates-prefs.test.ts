import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEnabledSets, setEnabledSets } from './key-dates-prefs'

/** In-memory Storage — `theme.test.ts`'s helper, same reason. */
function installMemoryLocalStorage(overrides: Partial<Storage> = {}) {
  const store = new Map<string, string>()
  const ls: Storage = {
    get length() {
      return store.size
    },
    clear: () => {
      store.clear()
    },
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    key: (index) => [...store.keys()][index] ?? null,
    ...overrides,
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
  Object.defineProperty(window, 'localStorage', { value: ls, configurable: true })
  return ls
}

beforeEach(() => {
  installMemoryLocalStorage()
})

describe('getEnabledSets', () => {
  it('returns the default for a brand nobody has touched', () => {
    expect(getEnabledSets('brand-1')).toEqual(['global'])
  })

  it('round-trips what was written', () => {
    setEnabledSets('brand-1', ['global', 'sg-events'])
    expect(getEnabledSets('brand-1')).toEqual(['global', 'sg-events'])
  })

  it('keeps an empty selection empty rather than restoring the default', () => {
    // The distinction the whole module turns on: "never chosen" and "chose
    // nothing" are different states, and handing the default back to a user who
    // switched everything off would make the menu look broken on every reload.
    setEnabledSets('brand-1', [])
    expect(getEnabledSets('brand-1')).toEqual([])
  })

  it('drops a member that is not a real set', () => {
    // A stored value survives a rename of the sets, and it is user-editable
    // text besides. `sg-culture` must degrade to a shorter list, not reach a
    // `Record` lookup that misses.
    localStorage.setItem('bf_key_dates_brand-1', 'global,sg-culture')
    expect(getEnabledSets('brand-1')).toEqual(['global'])
  })

  it('returns nothing when every stored member is unknown', () => {
    localStorage.setItem('bf_key_dates_brand-1', 'nonsense,more-nonsense')
    expect(getEnabledSets('brand-1')).toEqual([])
  })

  it('canonicalises the order regardless of how the value was written', () => {
    localStorage.setItem('bf_key_dates_brand-1', 'sg-events,global')
    expect(getEnabledSets('brand-1')).toEqual(['global', 'sg-events'])
  })

  it('keeps brands independent', () => {
    // The reason the key is per brand: an agency with a Singapore client and an
    // Australian one wants different answers, and a global key would make every
    // switch a change to every calendar.
    setEnabledSets('brand-1', ['sg-holidays'])
    expect(getEnabledSets('brand-1')).toEqual(['sg-holidays'])
    expect(getEnabledSets('brand-2')).toEqual(['global'])
  })

  it('returns the default instead of propagating a blocked localStorage', () => {
    installMemoryLocalStorage({
      getItem: () => {
        throw new Error('private browsing')
      },
    })
    expect(getEnabledSets('brand-1')).toEqual(['global'])
  })

  it('hands back a fresh array the caller may not mutate into the default', () => {
    // `DEFAULT_ENABLED_SETS` is module state. Returning it directly would let
    // one brand's toggle rewrite the default for every brand in the session.
    const first = getEnabledSets('brand-1')
    first.push('sg-events')
    expect(getEnabledSets('brand-2')).toEqual(['global'])
  })
})

describe('setEnabledSets', () => {
  it('writes under a brand-scoped key', () => {
    setEnabledSets('brand-1', ['global', 'sg-holidays'])
    expect(localStorage.getItem('bf_key_dates_brand-1')).toBe('global,sg-holidays')
  })

  it('writes an empty string for an empty selection', () => {
    setEnabledSets('brand-1', [])
    expect(localStorage.getItem('bf_key_dates_brand-1')).toBe('')
  })

  it('swallows a blocked localStorage rather than throwing', () => {
    const setItem = vi.fn(() => {
      throw new Error('quota')
    })
    installMemoryLocalStorage({ setItem })
    expect(() => setEnabledSets('brand-1', ['global'])).not.toThrow()
    expect(setItem).toHaveBeenCalled()
  })
})
