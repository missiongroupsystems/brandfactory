import type {
  ItemCategory,
  Opening,
  OpeningKind,
  Point,
  RoomKind,
} from "@/features/spaces/types";

/** Wall thickness used for drawing the boundary, mm. */
export const WALL_T = 150;

/** Narrowest opening the editor will produce, mm. */
export const MIN_OPENING_WIDTH = 300;

/** Sensible starting widths when placing an opening by hand, mm. */
export const DEFAULT_OPENING_WIDTHS: Record<OpeningKind, number> = {
  door: 900,
  "double-door": 1800,
  window: 1800,
  entrance: 2400,
};

export const OPENING_KIND_LABELS: Record<OpeningKind, string> = {
  door: "Door",
  "double-door": "Double door",
  window: "Window",
  entrance: "Entrance",
};

export interface OpeningPlacement {
  /** Centre of the opening span, on the wall line. */
  cx: number;
  cy: number;
  /** Rotation of the edge, degrees. */
  angle: number;
  /** Span length along the edge, mm. */
  len: number;
  /** Unit vector along the edge. */
  ux: number;
  uy: number;
  /** Unit normal (to the left of travel — into the room for a clockwise boundary). */
  nx: number;
  ny: number;
}

export function placeOpening(boundary: Point[], opening: Opening): OpeningPlacement {
  const a = boundary[opening.edge];
  const b = boundary[(opening.edge + 1) % boundary.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const sx = a.x + ux * opening.offset;
  const sy = a.y + uy * opening.offset;
  return {
    cx: sx + (ux * opening.width) / 2,
    cy: sy + (uy * opening.width) / 2,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    len: opening.width,
    ux,
    uy,
    // Clockwise polygon in screen coords (y down): interior is to the left of travel
    nx: uy,
    ny: -ux,
  };
}

/**
 * The plan and 3D palettes, as literal hex.
 *
 * **This is the one place in `src/` that holds raw colour values, and it is a deliberate
 * exception to the tier rule in `AGENTS.md`** rather than an oversight the token
 * reconciliation missed. An SVG `fill` can read `var(--…)` and the canvas does so
 * everywhere it can; a three.js `meshStandardMaterial` cannot — WebGL takes a number, and
 * there is no computed style to resolve for a colour that never touches the DOM. The
 * plan and the walkthrough have to agree on what a *bar* looks like, so both read these.
 *
 * The cost, stated rather than discovered: re-pointing tier 2 for a dark theme or a
 * tenant accent will not move these. When that happens they become the seam to update,
 * and they are in one file so that is a single edit.
 *
 * Muted categorical tints (§13) for zones — never the brand accent.
 */
export const ROOM_COLORS: Record<RoomKind, string> = {
  dining: "#5a7d5f",
  bar: "#7a5c8a",
  kitchen: "#335a7a",
  wc: "#6b6962",
  storage: "#b0843f",
  service: "#8a5a1f",
  outdoor: "#2f6b46",
  other: "#6b6962",
};

export const ITEM_COLORS: Record<ItemCategory, string> = {
  seating: "#5a7d5f",
  table: "#b0843f",
  counter: "#8a5a1f",
  equipment: "#335a7a",
  fixture: "#6b6962",
  decor: "#7a5c8a",
};

/**
 * A selected item in the walkthrough, and the one place the brand accent is a literal.
 *
 * Named rather than inlined because it is `--c-green-900` (`#1d3a2a`, tier 1, reached
 * everywhere else as `--color-brand-accent`) written out by hand: an anonymous copy of
 * the accent in a mesh material is exactly the duplicate that
 * survives a re-point of tier 2 and leaves one view green while the rest of the product
 * has moved. The plan canvas selects with `var(--color-brand-accent)` and does not need
 * this; only the 3D view does.
 */
export const SELECTED_COLOR = "#1d3a2a";

export function polygonPath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
}

export const snap = (v: number, grid = 25) => Math.round(v / grid) * grid;

export interface BoundaryProjection {
  /** Index of the nearest boundary edge (vertex i → i+1). */
  edge: number;
  /** Distance along that edge from vertex i, mm. */
  t: number;
  /** Distance from the query point to the projected point, mm. */
  dist: number;
  /** Length of the edge, mm. */
  len: number;
  /** The projected point on the edge. */
  x: number;
  y: number;
}

/** Nearest point on the boundary to (px, py) — how a centre point finds its wall. */
export function projectPointToBoundary(
  boundary: Point[],
  px: number,
  py: number,
): BoundaryProjection | null {
  let best: BoundaryProjection | null = null;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const t = Math.max(0, Math.min(len, ((px - a.x) * dx + (py - a.y) * dy) / len));
    const x = a.x + (dx / len) * t;
    const y = a.y + (dy / len) * t;
    const dist = Math.hypot(px - x, py - y);
    if (!best || dist < best.dist) best = { edge: i, t, dist, len, x, y };
  }
  return best;
}

/** Keep an opening's span inside its edge; width never below MIN_OPENING_WIDTH. */
export function clampOpeningToEdge(
  offset: number,
  width: number,
  edgeLen: number,
): { offset: number; width: number } {
  const w = Math.min(Math.max(width, MIN_OPENING_WIDTH), edgeLen);
  return { offset: Math.max(0, Math.min(edgeLen - w, offset)), width: w };
}

/**
 * Re-home every opening after the boundary changed. Openings are anchored by
 * their centre point in the plan, not by edge index — so moving a corner,
 * splitting an edge or pushing a whole wall keeps each door where the door is.
 * An opening left more than `toleranceMm` from any wall is dropped, not guessed.
 */
export function reprojectOpenings(
  oldBoundary: Point[],
  newBoundary: Point[],
  openings: Opening[],
  toleranceMm = 2000,
): Opening[] {
  const out: Opening[] = [];
  for (const op of openings) {
    if (op.edge < 0 || op.edge >= oldBoundary.length) continue;
    const c = placeOpening(oldBoundary, op);
    const proj = projectPointToBoundary(newBoundary, c.cx, c.cy);
    if (!proj || proj.dist > toleranceMm) continue;
    const { offset, width } = clampOpeningToEdge(
      snap(proj.t - op.width / 2),
      snap(op.width),
      proj.len,
    );
    out.push({ ...op, edge: proj.edge, offset, width });
  }
  return out;
}
