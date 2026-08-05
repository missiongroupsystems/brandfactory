import { describe, expect, it } from 'vitest'
import { brandNavKey, projectNavId, workspaceNavKey } from './nav-active'

describe('brandNavKey', () => {
  it('names the hub, the conversation list and each mini-app', () => {
    expect(brandNavKey('/brands/b-1', 'b-1')).toBe('overview')
    expect(brandNavKey('/brands/b-1/context', 'b-1')).toBe('context')
    expect(brandNavKey('/brands/b-1/apps/copywriting', 'b-1')).toBe('app:copywriting')
  })

  // The router does not add one, but a hand-typed URL or a redirect can, and a
  // nav that silently unlights itself is a page that looks like it left the app.
  it('tolerates a trailing slash', () => {
    expect(brandNavKey('/brands/b-1/', 'b-1')).toBe('overview')
    expect(brandNavKey('/brands/b-1/apps/visual/', 'b-1')).toBe('app:visual')
  })

  // A project is reached *through* a category but is not that category. The
  // nested thread rows are what mark the open one — see `BrandNavPanel`.
  it('lights nothing on a project route', () => {
    expect(brandNavKey('/projects/p-1', 'b-1')).toBeNull()
  })

  // The panel renders for the *active* brand, but the path can briefly belong
  // to another one mid-navigation. Matching on id rather than on shape is what
  // stops `Overview` lighting up for a brand you are leaving.
  it('lights nothing for a different brand’s path', () => {
    expect(brandNavKey('/brands/b-2', 'b-1')).toBeNull()
    expect(brandNavKey('/brands/b-2/apps/copywriting', 'b-1')).toBeNull()
  })

  it('does not treat a deeper path as its parent', () => {
    expect(brandNavKey('/brands/b-1/apps/copywriting/extra', 'b-1')).toBeNull()
  })

  // Without this arm every shelf route returned `null` and no nav row lit on
  // any of the three new pages — the panel would look like you had navigated
  // out of the brand entirely.
  it.each([
    ['identity', 'library:identity'],
    ['photography', 'library:photography'],
    ['collateral', 'library:collateral'],
  ])('names the %s shelf', (segment, key) => {
    expect(brandNavKey(`/brands/b-1/${segment}`, 'b-1')).toBe(key)
    expect(brandNavKey(`/brands/b-1/${segment}/`, 'b-1')).toBe(key)
  })

  /**
   * **A literal alternation, not `([^/]+)`.** A wildcard in that position would
   * turn every unrecognised brand-scoped path into `library:whatever` and light
   * a row that does not exist; `null` is the honest answer for a path this
   * function does not know.
   */
  it('does not invent a shelf for an unknown segment', () => {
    expect(brandNavKey('/brands/b-1/moodboard', 'b-1')).toBeNull()
    expect(brandNavKey('/brands/b-1/identity/extra', 'b-1')).toBeNull()
    expect(brandNavKey('/brands/b-2/identity', 'b-1')).toBeNull()
  })

  // Ids are UUIDs today. They are also interpolated into a pattern, and "the id
  // format will never change" is how an injected pattern gets written.
  it('escapes the id rather than interpolating it raw', () => {
    expect(brandNavKey('/brands/bx1/apps/social', 'b.1')).toBeNull()
  })
})

describe('workspaceNavKey', () => {
  it('names home and settings, and nothing else', () => {
    expect(workspaceNavKey('/workspaces/w-1', 'w-1')).toBe('overview')
    expect(workspaceNavKey('/workspaces/w-1/settings', 'w-1')).toBe('settings')
    expect(workspaceNavKey('/brands/b-1', 'w-1')).toBeNull()
    expect(workspaceNavKey('/workspaces/w-2', 'w-1')).toBeNull()
  })
})

describe('projectNavId', () => {
  it('reads the open thread, and only from a project path', () => {
    expect(projectNavId('/projects/p-1')).toBe('p-1')
    expect(projectNavId('/projects/p-1/')).toBe('p-1')
    expect(projectNavId('/brands/b-1')).toBeNull()
    expect(projectNavId('/projects')).toBeNull()
  })
})
