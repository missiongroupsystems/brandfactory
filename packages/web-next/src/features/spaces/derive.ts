import type { PlanItem, Point, Reference, Scheme } from "@/features/spaces/types";

/** Shoelace area of a polygon, mm² → m². */
export function polygonAreaM2(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2) / 1e6;
}

export function polygonBounds(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function totalCovers(items: PlanItem[]): number {
  return items.reduce((sum, it) => sum + it.seats, 0);
}

export interface CostLine {
  key: string;
  name: string;
  category: PlanItem["category"];
  qty: number;
  ref?: Reference;
  unitPrice?: number;
  total?: number;
  itemIds: string[];
}

/** Group placed items into cost lines. Identity: name + attached reference. */
export function costLines(scheme: Scheme): CostLine[] {
  const map = new Map<string, CostLine>();
  for (const it of scheme.items) {
    const key = `${it.name}::${it.refId ?? "unpriced"}`;
    const ref = it.refId
      ? scheme.references.find((r) => r.id === it.refId)
      : undefined;
    const existing = map.get(key);
    if (existing) {
      existing.qty += 1;
      existing.itemIds.push(it.id);
      if (existing.unitPrice != null) existing.total = existing.unitPrice * existing.qty;
    } else {
      map.set(key, {
        key,
        name: it.name,
        category: it.category,
        qty: 1,
        ref,
        unitPrice: ref?.price,
        total: ref?.price,
        itemIds: [it.id],
      });
    }
  }
  return [...map.values()].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
}

export function costSummary(scheme: Scheme) {
  const lines = costLines(scheme);
  const priced = lines.filter((l) => l.total != null);
  const unpriced = lines.filter((l) => l.total == null);
  const total = priced.reduce((s, l) => s + (l.total ?? 0), 0);
  const unpricedQty = unpriced.reduce((s, l) => s + l.qty, 0);
  return { lines, total, pricedLines: priced.length, unpricedLines: unpriced.length, unpricedQty };
}

/** The four numbers that follow the scheme everywhere. */
export function schemeStats(scheme: Scheme) {
  const area = polygonAreaM2(scheme.unit.boundary);
  const covers = totalCovers(scheme.items);
  const { total, unpricedQty } = costSummary(scheme);
  return {
    area,
    covers,
    areaPerCover: covers > 0 ? area / covers : null,
    estimate: total,
    unpricedQty,
  };
}
