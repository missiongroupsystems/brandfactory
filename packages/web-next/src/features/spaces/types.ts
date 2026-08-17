/**
 * OpenSpace domain model.
 *
 * All lengths are millimetres in plan coordinates: x → east, y → south
 * (SVG-friendly; the 3D view maps plan (x, y) → world (x, 0, y)).
 * The plan is the source of truth — the item you place is the reference
 * you pinned is the line you cost.
 */

export interface Point {
  x: number;
  y: number;
}

/** How a dimension or quantity was obtained. Honest-about-scale, made concrete. */
export type Provenance = "measured" | "derived" | "inferred" | "placed";

export type OpeningKind = "door" | "double-door" | "window" | "entrance";

/** An opening on a boundary edge, positioned along that edge. */
export interface Opening {
  id: string;
  /** Index of the boundary edge (from vertex i to i+1). */
  edge: number;
  /** Offset of the opening start along the edge, mm. */
  offset: number;
  /** Width along the edge, mm. */
  width: number;
  kind: OpeningKind;
}

export type RoomKind =
  | "dining"
  | "bar"
  | "kitchen"
  | "wc"
  | "storage"
  | "service"
  | "outdoor"
  | "other";

/** A zone/section of the unit. Axis-aligned rect for now — arrangement, not modelling. */
export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ItemCategory =
  | "seating"
  | "table"
  | "counter"
  | "equipment"
  | "fixture"
  | "decor";

/** A thing placed on the plan. The same thing the album pins and the cost prices. */
export interface PlanItem {
  id: string;
  name: string;
  category: ItemCategory;
  /** Centre point, mm. */
  x: number;
  y: number;
  /** Footprint, mm (w along local x before rotation, d along local y). */
  w: number;
  d: number;
  /** Height for the 3D view, mm. */
  h: number;
  /** Rotation in degrees, clockwise, about the centre. */
  rotation: number;
  /** Covers this item contributes. */
  seats: number;
  /** Attached album reference, if any. */
  refId?: string;
  /** Where the current dimensions came from. */
  dimSource: Provenance;
}

/** An album entry: a pinned reference that may carry a shopping link and price. */
export interface Reference {
  id: string;
  title: string;
  note?: string;
  url?: string;
  vendor?: string;
  /** Unit price in the scheme currency. */
  price?: number;
  /** Real-world dimensions, if known. Attaching these can push back on the layout. */
  dims?: { w: number; d: number; h: number };
  /** Simple visual identity for the card (no external images in v1). */
  swatch: string;
}

/** How the px→mm scale of the source drawing was established. */
export interface ScaleInfo {
  source: Provenance;
  method: string;
  confidence: "high" | "medium" | "low";
}

export interface Unit {
  name: string;
  address?: string;
  /** Boundary polygon, clockwise, mm. */
  boundary: Point[];
  openings: Opening[];
  /** Structural columns as centre points + square size, mm. */
  columns: { id: string; x: number; y: number; size: number }[];
  ceilingHeight: number;
  scale: ScaleInfo;
}

export interface Scheme {
  name: string;
  currency: string;
  unit: Unit;
  rooms: Room[];
  items: PlanItem[];
  references: Reference[];
}
