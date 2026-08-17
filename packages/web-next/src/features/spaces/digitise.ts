import type {
  Opening,
  OpeningKind,
  Point,
  Provenance,
  Scheme,
  Unit,
} from "@/features/spaces/types";
import { polygonAreaM2, polygonBounds } from "@/features/spaces/derive";
import {
  MIN_OPENING_WIDTH,
  projectPointToBoundary,
  snap,
} from "@/features/spaces/plan-geometry";

/**
 * Shared contract between the digitiser route (/api/digitise) and the
 * WelcomeDialog: the streamed progress events, the raw geometry the model
 * emits, and the pure normalisation that turns it into a valid Unit.
 *
 * The model never invents edge indices — it reports openings and columns as
 * centre coordinates, and we project them onto the boundary here. Anything
 * that can be checked in code is checked in code; that computed check is the
 * "checking itself" step the dialog shows.
 */

export type DigitiseStepId = "read" | "scale" | "trace" | "check";

export type DigitiseEvent =
  | { type: "step"; id: DigitiseStepId; status: "active" | "done"; detail?: string }
  | { type: "result"; scheme: Scheme }
  | { type: "error"; message: string };

/** Pass 1 output: what the drawing is and how its scale was established. */
export interface ReadFindings {
  drawingType: string;
  unitName: string | null;
  address: string | null;
  /** Stated floor area in m², if printed on the drawing. */
  statedAreaM2: number | null;
  dimensionStrings: string[];
  scaleMethod: string;
  scaleSource: Provenance;
  scaleConfidence: "high" | "medium" | "low";
  readSummary: string;
}

/** Pass 2 output: geometry in real-world mm, centre-point based. */
export interface TraceFindings {
  boundary: Point[];
  openings: { x: number; y: number; width: number; kind: OpeningKind }[];
  columns: { x: number; y: number; size: number }[];
  ceilingHeightMm: number | null;
  traceSummary: string;
}

const OPENING_SNAP_TOLERANCE_MM = 1200;

/** Signed shoelace sum — positive means clockwise in screen coords (y down). */
function shoelaceSum(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/** Project an opening centre onto the nearest boundary edge → Opening. */
function projectOpening(
  boundary: Point[],
  raw: TraceFindings["openings"][number],
  id: string,
): Opening | null {
  const best = projectPointToBoundary(boundary, raw.x, raw.y);
  if (!best || best.dist > OPENING_SNAP_TOLERANCE_MM) return null;
  const width = Math.min(Math.max(snap(raw.width), MIN_OPENING_WIDTH), best.len);
  const offset = Math.max(0, Math.min(best.len - width, snap(best.t - width / 2)));
  return { id, edge: best.edge, offset, width, kind: raw.kind };
}

export interface NormalisedUnit {
  unit: Unit;
  areaM2: number;
  droppedOpenings: number;
}

/**
 * Turn raw model geometry into a valid Unit: snap to the 25 mm grid,
 * translate to origin, enforce clockwise winding, project openings onto
 * edges, and keep columns that actually sit inside the unit's bounds.
 */
export function normaliseUnit(
  read: ReadFindings,
  trace: TraceFindings,
  fallbackName: string,
): NormalisedUnit {
  const cleaned = trace.boundary
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: snap(p.x), y: snap(p.y) }));
  if (cleaned.length < 3) {
    throw new Error("The traced boundary has fewer than 3 corners.");
  }

  // Drop consecutive duplicates (snapping can collapse short edges).
  const boundary: Point[] = [];
  for (const p of cleaned) {
    const prev = boundary[boundary.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) boundary.push(p);
  }
  const first = boundary[0];
  const last = boundary[boundary.length - 1];
  if (boundary.length > 3 && first.x === last.x && first.y === last.y) {
    boundary.pop();
  }
  if (boundary.length < 3) {
    throw new Error("The traced boundary collapsed after snapping.");
  }

  // Translate to origin.
  const bounds = polygonBounds(boundary);
  for (const p of boundary) {
    p.x -= bounds.minX;
    p.y -= bounds.minY;
  }

  // Clockwise in screen coords (y down) — what the plan and 3D view expect.
  if (shoelaceSum(boundary) < 0) boundary.reverse();

  const translate = (p: { x: number; y: number }) => ({
    x: p.x - bounds.minX,
    y: p.y - bounds.minY,
  });

  let droppedOpenings = 0;
  const openings: Opening[] = [];
  trace.openings.forEach((raw, i) => {
    const projected = projectOpening(
      boundary,
      { ...raw, ...translate(raw) },
      `op-${i}`,
    );
    if (projected) openings.push(projected);
    else droppedOpenings++;
  });

  const columns = trace.columns
    .map((c, i) => ({
      id: `col-${i}`,
      ...translate({ x: snap(c.x), y: snap(c.y) }),
      size: Math.min(Math.max(snap(c.size || 300), 150), 1500),
    }))
    .filter(
      (c) => c.x >= 0 && c.y >= 0 && c.x <= bounds.w && c.y <= bounds.h,
    );

  const unit: Unit = {
    name: read.unitName ?? fallbackName,
    address: read.address ?? undefined,
    boundary,
    openings,
    columns,
    ceilingHeight: trace.ceilingHeightMm ?? 3000,
    scale: {
      source: read.scaleSource,
      method: read.scaleMethod,
      confidence: read.scaleConfidence,
    },
  };

  return { unit, areaM2: polygonAreaM2(boundary), droppedOpenings };
}

/** The self-check the dialog reports: computed area vs what the drawing states. */
export function areaCheck(
  areaM2: number,
  statedAreaM2: number | null,
): { detail: string; withinTolerance: boolean } {
  if (statedAreaM2 == null || statedAreaM2 <= 0) {
    return {
      detail: `Computed ${areaM2.toFixed(1)} m² — no stated area on the drawing to check against`,
      withinTolerance: true,
    };
  }
  const deviation = Math.abs(areaM2 - statedAreaM2) / statedAreaM2;
  const pct = (deviation * 100).toFixed(0);
  return {
    detail:
      deviation <= 0.15
        ? `Computed ${areaM2.toFixed(1)} m² against stated ~${statedAreaM2} m² — within tolerance`
        : `Computed ${areaM2.toFixed(1)} m² vs stated ~${statedAreaM2} m² — ${pct}% off, scale may be uncertain`,
    withinTolerance: deviation <= 0.15,
  };
}
