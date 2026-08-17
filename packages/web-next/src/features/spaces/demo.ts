import type { PlanItem, Reference, Scheme } from "@/features/spaces/types";
import { CATALOG } from "@/features/spaces/catalog";

/**
 * The demo unit: a ~108 m² corner shophouse unit with a notched front-right
 * corner (service riser), entrance on the front, window run along the front.
 * Stands in for a digitised landlord drawing until the ingestion agent lands.
 */

let n = 0;
const id = (prefix: string) => `${prefix}-${(n++).toString(36)}`;

function place(
  key: string,
  x: number,
  y: number,
  overrides: Partial<PlanItem> = {},
): PlanItem {
  const c = CATALOG.find((e) => e.key === key);
  if (!c) throw new Error(`Unknown catalog key: ${key}`);
  return {
    id: id(key),
    name: c.name,
    category: c.category,
    x,
    y,
    w: c.w,
    d: c.d,
    h: c.h,
    rotation: 0,
    seats: c.seats,
    dimSource: "placed",
    ...overrides,
  };
}

const references: Reference[] = [
  {
    id: "ref-chair",
    title: "Bentwood chair No. 14",
    vendor: "TON",
    url: "https://www.ton.eu/en/chair-14",
    price: 185,
    dims: { w: 430, d: 500, h: 840 },
    swatch: "#9a6b43",
    note: "The classic. Stacks, survives service.",
  },
  {
    id: "ref-table",
    title: "Solid oak 4-top",
    vendor: "Journey East",
    url: "https://journeyeast.com",
    price: 420,
    dims: { w: 1200, d: 700, h: 740 },
    swatch: "#c2a878",
  },
  {
    id: "ref-banquette",
    title: "Banquette, upholstered — per 1200 module",
    vendor: "Local joinery",
    price: 640,
    dims: { w: 1200, d: 600, h: 900 },
    swatch: "#5d6b52",
    note: "Quote from the Joo Chiat workshop, fabric excluded.",
  },
  {
    id: "ref-stool",
    title: "Bar stool, brass footrail",
    vendor: "Castlery",
    url: "https://castlery.com",
    price: 160,
    dims: { w: 400, d: 400, h: 750 },
    swatch: "#8a8f98",
  },
  {
    id: "ref-sofa",
    title: "Husk sofa, 2.5-seater",
    vendor: "B&B Italia",
    url: "https://bebitalia.com",
    price: 2200,
    dims: { w: 1680, d: 830, h: 760 },
    swatch: "#7d5a50",
    note: "The one from the showroom. Slightly deeper than the box we drew.",
  },
  {
    id: "ref-pendant",
    title: "Rattan pendant, 450",
    vendor: "Originals",
    price: 90,
    swatch: "#c9b48a",
    note: "Over the banquette run, one per table.",
  },
  {
    id: "ref-terrazzo",
    title: "Terrazzo, warm grey",
    vendor: "Rice Fields",
    price: 68,
    swatch: "#b8b2a8",
    note: "Per m². Front-of-house floor candidate.",
  },
];

function buildItems(): PlanItem[] {
  const items: PlanItem[] = [];

  // Banquette run along the front window (window spans x 2400–9600 on the front wall)
  for (let i = 0; i < 6; i++) {
    items.push(
      place("banquette", 3300 + i * 1200, 7150, { refId: "ref-banquette" }),
    );
  }

  // Four-tops serving the banquette run, chairs on the room side
  for (const tx of [3600, 5400, 7200, 9000]) {
    items.push(place("table-4", tx, 6350, { refId: "ref-table" }));
    items.push(place("chair", tx - 280, 5700, { rotation: 180, refId: "ref-chair" }));
    items.push(place("chair", tx + 280, 5700, { rotation: 180, refId: "ref-chair" }));
  }

  // Bar
  items.push(place("bar-counter", 7700, 2200, { w: 3000 }));
  items.push(place("shelving", 7700, 500, { w: 3000, name: "Back bar" }));
  for (const sx of [6600, 7300, 8000, 8700]) {
    items.push(place("barstool", sx, 2950, { refId: "ref-stool" }));
  }
  items.push(place("coffee-machine", 9800, 2100, { rotation: 90 }));

  // Kitchen along the rear wall, pass on the kitchen edge
  items.push(place("cook-line", 1400, 700));
  items.push(place("kitchen-bench", 2600, 2500, { rotation: 180 }));
  items.push(place("fridge", 4300, 800, { rotation: 90 }));
  items.push(place("service-station", 5400, 1700, { rotation: 90, name: "Pass" }));

  // WCs
  items.push(place("wc-pan", 500, 3600));
  items.push(place("basin", 1300, 3600));

  // Dry store
  items.push(place("shelving", 12800, 450));
  items.push(place("shelving", 12800, 1350, { rotation: 180 }));

  // Entry
  items.push(place("host-stand", 11700, 6900));

  // Lounge corner — the sofa is still a plain box; its reference is pinned
  // in the album but not yet attached. That link is the demo.
  items.push(place("sofa", 13700, 4600, { rotation: 90 }));
  items.push(place("table-round", 12700, 4600, { w: 700, d: 700, name: "Coffee table" }));
  items.push(place("armchair", 12800, 3500, { rotation: 135 }));

  // Greenery
  items.push(place("planter", 950, 6950));
  items.push(place("planter", 10250, 6950));

  return items;
}

export function createDemoScheme(): Scheme {
  n = 0;
  return {
    name: "Amoy Street 42 — Scheme A",
    currency: "S$",
    unit: {
      name: "42 Amoy Street, #01-01",
      boundary: [
        { x: 0, y: 0 },
        { x: 14400, y: 0 },
        { x: 14400, y: 6400 },
        { x: 13200, y: 6400 },
        { x: 13200, y: 7600 },
        { x: 0, y: 7600 },
      ],
      openings: [
        // Front wall is edge 4: (13200, 7600) → (0, 7600), offset runs east → west
        { id: "op-entry", edge: 4, offset: 600, width: 1800, kind: "double-door" },
        { id: "op-window", edge: 4, offset: 3600, width: 7200, kind: "window" },
        { id: "op-window-2", edge: 4, offset: 11400, width: 1200, kind: "window" },
        // Service door on the rear wall (edge 0, west → east)
        { id: "op-service", edge: 0, offset: 600, width: 900, kind: "door" },
      ],
      columns: [
        { id: "col-1", x: 4800, y: 3800, size: 400 },
        { id: "col-2", x: 9600, y: 3800, size: 400 },
      ],
      ceilingHeight: 3200,
      scale: {
        source: "measured",
        method: "Two printed dimension strings, cross-checked (14 400 × 7 600)",
        confidence: "high",
      },
    },
    rooms: [
      { id: "rm-kitchen", name: "Kitchen", kind: "kitchen", x: 0, y: 0, w: 4800, h: 3200 },
      { id: "rm-pass", name: "Pass", kind: "service", x: 4800, y: 0, w: 1200, h: 3200 },
      { id: "rm-bar", name: "Bar", kind: "bar", x: 6000, y: 0, w: 4200, h: 3200 },
      { id: "rm-store", name: "Dry store", kind: "storage", x: 12000, y: 0, w: 2400, h: 1800 },
      { id: "rm-wc", name: "WC", kind: "wc", x: 0, y: 3200, w: 1800, h: 2000 },
      { id: "rm-dining", name: "Dining", kind: "dining", x: 1800, y: 3200, w: 11400, h: 4400 },
    ],
    items: buildItems(),
    references,
  };
}
