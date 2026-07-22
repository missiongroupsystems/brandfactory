import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, getStoredTheme, resolveTheme, setStoredTheme } from './theme'

/** In-memory Storage — some jsdom builds expose a partial localStorage without `.clear`. */
function installMemoryLocalStorage() {
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
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
  Object.defineProperty(window, 'localStorage', { value: ls, configurable: true })
}

function mockMatchMedia(prefersDark: boolean) {
  const mm = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark') ? prefersDark : !prefersDark,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }))
  // Prefer defineProperty over stubGlobal so unstubAllGlobals doesn't leave
  // localStorage half-replaced (root cause of "clear is not a function").
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: mm,
  })
}

describe('theme', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getStoredTheme', () => {
    it('defaults to "system" when nothing is stored', () => {
      expect(getStoredTheme()).toBe('system')
    })

    it('returns a stored valid mode', () => {
      localStorage.setItem('bf_theme', 'dark')
      expect(getStoredTheme()).toBe('dark')
    })

    it('falls back to "system" for an unknown value', () => {
      localStorage.setItem('bf_theme', 'neon')
      expect(getStoredTheme()).toBe('system')
    })
  })

  describe('setStoredTheme', () => {
    it('writes the mode to localStorage', () => {
      setStoredTheme('light')
      expect(localStorage.getItem('bf_theme')).toBe('light')
    })
  })

  describe('resolveTheme', () => {
    it('returns the mode directly for explicit light/dark', () => {
      expect(resolveTheme('light')).toBe('light')
      expect(resolveTheme('dark')).toBe('dark')
    })

    it('resolves "system" via prefers-color-scheme: dark', () => {
      mockMatchMedia(true)
      expect(resolveTheme('system')).toBe('dark')
    })

    it('resolves "system" to light when the OS prefers light', () => {
      mockMatchMedia(false)
      expect(resolveTheme('system')).toBe('light')
    })
  })

  describe('applyTheme', () => {
    it('toggles the `.dark` class on <html> based on the resolved mode', () => {
      applyTheme('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      applyTheme('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })
})
