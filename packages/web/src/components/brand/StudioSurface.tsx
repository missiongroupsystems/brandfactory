import { useMemo } from 'react'
import { studioSchema } from '@/components/brand/studioSchema'
import { ToolcraftApp } from '@/toolcraft/runtime/react'

// ---------------------------------------------------------------------------
// StudioSurface — the vendored canvas, mounted
// ---------------------------------------------------------------------------
//
// Everything this file does is hand a schema to the surface. The surface itself
// is `src/toolcraft`, vendored from pixel-point/toolcraft — see that tree's
// README for what was taken, what was dropped and why. The schema and its
// reasoning live in `studioSchema.ts`.
//
// **This is the default export, and the only one, on purpose.** It is the
// `React.lazy` split point: the runtime plus its control widgets is the single
// largest thing in this app, and every route that is not the studio has no use
// for it. Imported eagerly it lands in the entry chunk, which means the login
// page pays for a gradient editor. Keep the default export, and keep
// `runtime/react` out of every other module's import graph.

export default function StudioSurface({ brandId }: { brandId: string }) {
  // The schema is the reducer's init argument, so a new object identity per
  // render would be a new persistence subscription per render.
  const schema = useMemo(() => studioSchema(brandId), [brandId])

  // `ToolcraftApp` sets `min-width: 1024px` on itself and clips its own
  // overflow — the panels are absolutely positioned against the canvas and do
  // not reflow. Below that width the honest thing is a scrollbar on the
  // container rather than a surface that quietly crops its own toolbar.
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <ToolcraftApp schema={schema} className="h-full" />
    </div>
  )
}
