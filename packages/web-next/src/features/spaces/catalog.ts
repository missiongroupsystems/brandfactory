import type { ItemCategory } from "@/features/spaces/types";

/**
 * The palette: what you can drop on the plan, with sensible default
 * footprints (mm) so a plain box is already roughly right.
 */
export interface CatalogEntry {
  key: string;
  name: string;
  category: ItemCategory;
  w: number;
  d: number;
  h: number;
  seats: number;
}

export const CATALOG: CatalogEntry[] = [
  // Seating
  { key: "chair", name: "Chair", category: "seating", w: 450, d: 480, h: 820, seats: 1 },
  { key: "armchair", name: "Armchair", category: "seating", w: 680, d: 720, h: 780, seats: 1 },
  { key: "barstool", name: "Bar stool", category: "seating", w: 400, d: 400, h: 750, seats: 1 },
  { key: "banquette", name: "Banquette", category: "seating", w: 1200, d: 600, h: 900, seats: 2 },
  { key: "sofa", name: "Sofa", category: "seating", w: 1600, d: 800, h: 750, seats: 2 },
  // Tables
  { key: "table-2", name: "Table (2-top)", category: "table", w: 700, d: 700, h: 740, seats: 0 },
  { key: "table-4", name: "Table (4-top)", category: "table", w: 1200, d: 700, h: 740, seats: 0 },
  { key: "table-round", name: "Round table", category: "table", w: 900, d: 900, h: 740, seats: 0 },
  { key: "communal", name: "Communal table", category: "table", w: 2400, d: 900, h: 740, seats: 0 },
  // Counters
  { key: "bar-counter", name: "Bar counter", category: "counter", w: 2400, d: 650, h: 1100, seats: 0 },
  { key: "host-stand", name: "Host stand", category: "counter", w: 600, d: 450, h: 1100, seats: 0 },
  { key: "service-station", name: "Service station", category: "counter", w: 900, d: 550, h: 900, seats: 0 },
  // Equipment
  { key: "kitchen-bench", name: "Kitchen bench", category: "equipment", w: 1800, d: 700, h: 900, seats: 0 },
  { key: "cook-line", name: "Cook line", category: "equipment", w: 2400, d: 800, h: 900, seats: 0 },
  { key: "fridge", name: "Upright fridge", category: "equipment", w: 700, d: 800, h: 2000, seats: 0 },
  { key: "coffee-machine", name: "Espresso machine", category: "equipment", w: 800, d: 600, h: 500, seats: 0 },
  // Fixtures
  { key: "wc-pan", name: "WC", category: "fixture", w: 700, d: 400, h: 800, seats: 0 },
  { key: "basin", name: "Basin", category: "fixture", w: 550, d: 450, h: 850, seats: 0 },
  { key: "shelving", name: "Shelving", category: "fixture", w: 1200, d: 450, h: 1800, seats: 0 },
  // Decor
  { key: "planter", name: "Planter", category: "decor", w: 500, d: 500, h: 1200, seats: 0 },
  { key: "pendant-zone", name: "Rug", category: "decor", w: 2000, d: 1400, h: 20, seats: 0 },
];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  seating: "Seating",
  table: "Tables",
  counter: "Counters",
  equipment: "Equipment",
  fixture: "Fixtures",
  decor: "Decor",
};

export const CATEGORY_ORDER: ItemCategory[] = [
  "seating",
  "table",
  "counter",
  "equipment",
  "fixture",
  "decor",
];
