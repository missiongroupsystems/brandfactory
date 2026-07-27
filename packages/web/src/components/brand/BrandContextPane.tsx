import type { BrandWithSections } from '@brandfactory/shared'
import { BrandGuidelinesEditor } from '@/components/brand/BrandGuidelinesEditor'
import type { CapturePayload } from '@/components/project/MessageCapture'

/**
 * The right pane of a brand-context thread: the live guidelines editor where
 * the canvas would otherwise be.
 *
 * A thin frame on purpose. The editor owns its own Save button and `Cmd-S`
 * handler, and this wrapper deliberately does **not** add a second one — the
 * same call `EditGuidelinesDialog` already declined to make. Two save paths over
 * one destructive full-list write is how you get a wipe nobody can explain.
 *
 * `key={brand.id}` preserves the remount-on-brand-switch idiom the editor's
 * local-state seeding depends on (it reads `brand.sections` once, at mount).
 *
 * Note: these threads still have a canvas server-side — every project gets one
 * at creation — we simply don't render it here. Cheaper than making canvas
 * creation conditional, and it keeps the thread convertible later. Phase F stops
 * the agent from *writing* to that unrendered canvas, which is the part that
 * would otherwise lose work.
 */
export interface BrandContextPaneProps {
  brand: BrandWithSections
  /** A message captured via the click path, on its way into a new section. */
  staged?: CapturePayload | null
  onStagedConsumed?: () => void
}

export function BrandContextPane({ brand, staged, onStagedConsumed }: BrandContextPaneProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Matches CanvasPane's header strip so the two right panes read as the
          same slot holding different things. */}
      <div className="border-b p-3 text-sm font-medium">Brand context</div>
      <div className="flex-1 overflow-y-auto p-4">
        <BrandGuidelinesEditor
          key={brand.id}
          brand={brand}
          staged={staged}
          onStagedConsumed={onStagedConsumed}
        />
      </div>
    </div>
  )
}
