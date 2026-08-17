"use client";

import { Armchair, TriangleAlert, Users } from "lucide-react";
import { Card, Pill } from "@/features/spaces/components/ui";
import { useSchemeStore } from "@/features/spaces/store";
import { costSummary, schemeStats } from "@/features/spaces/derive";
import { fmtArea, fmtMoney } from "@/features/spaces/format";
import { CATEGORY_LABELS } from "@/features/spaces/catalog";

/**
 * A running estimate built from what is actually on the plan. Not a quantity
 * survey — a live answer to "what is this costing me so far".
 */
export function CostView() {
  const scheme = useSchemeStore((s) => s.scheme);
  const stats = schemeStats(scheme);
  const { lines, total, pricedLines, unpricedLines, unpricedQty } = costSummary(scheme);

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Stat cards — one accent hero, per the accent budget */}
      <div className="mb-5 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <div data-surface="accent" className="rounded-xl bg-surface-accent p-5 text-ink-inverse shadow-e1">
          <div className="flex items-start justify-between">
            <span className="text-[13px] opacity-80">Estimated fit-out so far</span>
          </div>
          <div data-numeric className="mt-2 text-4xl font-medium tracking-[-0.02em]">
            {fmtMoney(total, scheme.currency)}
          </div>
          <div className="mt-1.5 text-[13px] opacity-70">
            {pricedLines} of {pricedLines + unpricedLines} lines priced — moves when
            the plan moves
          </div>
        </div>

        <StatCard
          label="Items on plan"
          icon={<Armchair className="size-4 text-ink-tertiary" strokeWidth={1.5} />}
          value={String(scheme.items.length)}
          sub={`across ${scheme.rooms.length} zones`}
        />
        <StatCard
          label="Covers"
          icon={<Users className="size-4 text-ink-tertiary" strokeWidth={1.5} />}
          value={String(stats.covers)}
          sub={`${fmtArea(stats.area)} · ${
            stats.areaPerCover ? stats.areaPerCover.toFixed(1) : "—"
          } m² per cover`}
        />
        <StatCard
          label="Unpriced items"
          warning={unpricedQty > 0}
          icon={
            <TriangleAlert
              className={`size-4 ${unpricedQty > 0 ? "text-warning" : "text-ink-tertiary"}`}
              strokeWidth={1.5}
            />
          }
          value={String(unpricedQty)}
          sub={
            unpricedQty > 0
              ? "Attach references to price them"
              : "Everything on the plan is priced"
          }
        />
      </div>

      <Card>
        <div className="border-b border-border-subtle px-5 py-4">
          <h3 className="text-base font-medium text-ink">Cost lines</h3>
          <p className="text-[13px] text-ink-tertiary">
            One line per item type — quantities counted off the plan itself.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs font-medium text-ink-secondary">
              <th className="px-5 py-2.5">Item</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5 text-right">Qty</th>
              <th className="px-3 py-2.5 text-right">Unit price</th>
              <th className="px-5 py-2.5 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.key}
                className="border-b border-border-subtle text-sm transition-colors duration-120 last:border-0 hover:bg-surface-hover"
              >
                <td className="px-5 py-2.5 font-medium text-ink">{line.name}</td>
                <td className="px-3 py-2.5">
                  <Pill>{CATEGORY_LABELS[line.category]}</Pill>
                </td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-ink-secondary">
                  {line.ref ? line.ref.title : "—"}
                </td>
                <td data-numeric className="px-3 py-2.5 text-right text-ink">{line.qty}</td>
                <td data-numeric className="px-3 py-2.5 text-right text-ink">
                  {line.unitPrice != null ? (
                    fmtMoney(line.unitPrice, scheme.currency)
                  ) : (
                    <Pill tone="warning">
                      <TriangleAlert className="size-3" strokeWidth={2} />
                      Unpriced
                    </Pill>
                  )}
                </td>
                <td data-numeric className="px-5 py-2.5 text-right font-medium text-ink">
                  {line.total != null ? fmtMoney(line.total, scheme.currency) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong text-sm">
              <td className="px-5 py-3 font-medium text-ink" colSpan={5}>
                Estimate so far
              </td>
              <td data-numeric className="px-5 py-3 text-right text-base font-medium text-ink">
                {fmtMoney(total, scheme.currency)}
              </td>
            </tr>
          </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  warning = false,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <span className="text-[13px] text-ink-secondary">{label}</span>
        {icon}
      </div>
      <div
        data-numeric className={`mt-2 text-3xl font-medium tracking-[-0.01em] ${
          warning ? "text-warning" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div className={`mt-1.5 text-[13px] ${warning ? "text-warning" : "text-ink-secondary"}`}>
        {sub}
      </div>
    </Card>
  );
}
