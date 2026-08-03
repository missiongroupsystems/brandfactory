import { defineToolcraft } from '@/toolcraft/runtime'
import type { ToolcraftLocalStoragePersistenceSchema } from '@/toolcraft/runtime'

// ---------------------------------------------------------------------------
// The studio's schema — every choice the Studio mini-app actually makes
// ---------------------------------------------------------------------------
//
// Split out of `StudioSurface` so it can be tested without mounting the engine:
// `@/toolcraft/runtime` is pure schema and state, while `runtime/react` drags in
// the canvas, the panels and every control widget. That split is also why this
// file must never import from `runtime/react` — it would put the lazy chunk back
// into the eager graph through the back door.

/**
 * Where a brand's canvas is kept.
 *
 * Exported rather than inlined below because `StudioSurface` has to ask a
 * question the runtime does not answer: *has this brand's canvas ever been
 * opened?* — which is what decides whether it may choose the opening zoom. Two
 * readers, one definition of the key.
 *
 * Typed off the runtime's own key rather than as `string`, so the
 * `toolcraft:…:state:v…` shape it insists on is checked here rather than at the
 * one call site that happens to assign it.
 */
export function studioStorageKey(brandId: string): ToolcraftLocalStoragePersistenceSchema['key'] {
  return `toolcraft:brandfactory-studio-${brandId}:state:v1`
}

/**
 * No brand context is wired this pass — the canvas is generic, and the palette,
 * asset-library and export-to-`brand_assets` seams are the follow-up. The one
 * brand-shaped thing here is the **persistence key**, and that is not a
 * binding: state lands in `localStorage`, so a single key would show one
 * brand's canvas under another brand's name the moment you switched. Scoping it
 * is a correctness floor, not the integration.
 */
export function studioSchema(brandId: string) {
  return defineToolcraft({
    canvas: {
      enabled: true,
      upload: true,
    },
    panels: {
      controls: {
        // Empty this pass: a control section is a statement about what the tool
        // *does*, and this one does not have a job yet. The panel renders its
        // own empty state; inventing sliders to fill it would be the "generic
        // image toy" the scope deliberately stopped short of.
        sections: [],
        title: 'Controls',
      },
    },
    persistence: {
      storage: 'localStorage',
      key: studioStorageKey(brandId),
      version: 1,
      include: ['canvas', 'layers', 'media', 'panels', 'values'],
    },
    toolbar: {
      history: true,
      radar: true,
      zoom: true,
      // **Off, because the app already has one.** Upstream's toolbar carries a
      // light/dark toggle backed by the vendored provider's own preference and
      // its own storage key. The rail's foot has owned the theme since 1.15.0,
      // and the studio inherits it through the token cascade
      // (`src/styles/toolcraft.css`), so leaving this on would put a second
      // switch on screen that disagrees with the first.
      theme: false,
    },
  })
}
