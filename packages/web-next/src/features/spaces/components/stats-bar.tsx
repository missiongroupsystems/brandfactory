"use client";

import { TriangleAlert } from "lucide-react";
import { useSchemeStore } from "@/features/spaces/store";
import { schemeStats } from "@/features/spaces/derive";
import { fmtArea, fmtMoney } from "@/features/spaces/format";

/**
 * The numbers that follow the scheme everywhere. One store, four views —
 * move a banquette in the plan and the estimate here moves with it.
 */
export function StatsBar() {
  const scheme = useSchemeStore((s) => s.scheme);
  const stats = schemeStats(scheme);

  return (
    <div className="flex shrink-0 items-center gap-6 border-b border-border bg-surface px-6 py-3 max-md:gap-4 max-md:overflow-x-auto">
      <Stat label="Floor area" value={fmtArea(stats.area)} />
      <Divider />
      <Stat label="Covers" value={String(stats.covers)} />
      <Divider />
      <Stat
        label="Area per cover"
        value={stats.areaPerCover ? `${stats.areaPerCover.toFixed(1)} m²` : "—"}
      />
      <Divider />
      <Stat label="Estimate" value={fmtMoney(stats.estimate, scheme.currency)} />
      {stats.unpricedQty > 0 && (
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-warning">
          <TriangleAlert className="size-3.5" strokeWidth={2} />
          {stats.unpricedQty} items unpriced
        </span>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="text-[13px] text-ink-secondary">{label}</span>
      <span data-numeric className="text-base font-medium text-ink">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px bg-border-subtle max-md:hidden" aria-hidden />;
}
