"use client";

import { useSchemeStore } from "@/features/spaces/store";
import { polygonBounds } from "@/features/spaces/derive";
import { CATALOG, CATEGORY_LABELS, CATEGORY_ORDER } from "@/features/spaces/catalog";
import { ITEM_COLORS } from "@/features/spaces/plan-geometry";
import { fmtDims } from "@/features/spaces/format";

/** Click to drop a plain box on the plan — specificity can arrive later. */
export function Palette() {
  const addItem = useSchemeStore((s) => s.addItem);
  const boundary = useSchemeStore((s) => s.scheme.unit.boundary);

  const drop = (key: string) => {
    const b = polygonBounds(boundary);
    addItem(key, b.minX + b.w / 2, b.minY + b.h / 2);
  };

  return (
    <aside className="w-[200px] shrink-0 overflow-y-auto border-r border-border bg-surface">
      <div className="px-4 pb-1 pt-4 text-[13px] font-medium text-ink">Add to plan</div>
      <div className="px-4 pb-2 text-xs text-ink-tertiary">
        Drops a plain box at real size. Attach the real thing later.
      </div>
      {CATEGORY_ORDER.map((cat) => (
        <div key={cat} className="pb-2">
          <div className="px-4 pb-1 pt-2 text-xs font-medium text-ink-secondary">
            {CATEGORY_LABELS[cat]}
          </div>
          {CATALOG.filter((c) => c.category === cat).map((c) => (
            <button
              key={c.key}
              onClick={() => drop(c.key)}
              className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left transition-colors duration-120 hover:bg-surface-hover"
            >
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: ITEM_COLORS[c.category] }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{c.name}</span>
                <span data-numeric className="block text-[11px] text-ink-tertiary">
                  {fmtDims(c.w, c.d)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}
