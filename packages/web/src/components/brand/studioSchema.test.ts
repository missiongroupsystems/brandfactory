import { describe, expect, it } from 'vitest'
import { studioSchema } from './studioSchema'

// The schema is the whole of the Studio mini-app's own logic — everything else
// on that route is vendored. These assert the three choices that are ours, and
// they run against the real `defineToolcraft`, so a config the resolver would
// reject fails here rather than on the page.

describe('studioSchema', () => {
  it('scopes persistence to the brand, so one canvas cannot appear under another', () => {
    const a = studioSchema('b-1')
    const b = studioSchema('b-2')

    expect(a.persistence.storage).toBe('localStorage')
    expect(a.persistence).toHaveProperty('key', 'toolcraft:brandfactory-studio-b-1:state:v1')
    expect(b.persistence).toHaveProperty('key', 'toolcraft:brandfactory-studio-b-2:state:v1')
  })

  // The rail's foot has owned the theme since 1.15.0. Upstream's toolbar toggle
  // is backed by the vendored provider's own preference and its own storage
  // key, so leaving it on puts a second switch on screen that disagrees with
  // the first — and colour comes from our cascade, so it would half-work.
  it('turns off the vendored theme toggle and keeps the rest of the toolbar', () => {
    const schema = studioSchema('b-1')

    expect(schema.toolbar.theme).toBe(false)
    expect(schema.toolbar.history).toBe(true)
    expect(schema.toolbar.radar).toBe(true)
    expect(schema.toolbar.zoom).toBe(true)
  })

  it('enables the canvas and its upload affordance', () => {
    const schema = studioSchema('b-1')

    expect(schema.canvas.enabled).toBe(true)
    expect(schema.canvas.upload).toBe(true)
    expect(schema.assembly.surfaces.canvas.enabled).toBe(true)
  })
})
