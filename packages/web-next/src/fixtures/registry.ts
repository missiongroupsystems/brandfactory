import type { Entity, Outlet } from "@/lib/api/types";

/**
 * Registry fixtures — the entities and outlets the Outlets area renders.
 *
 * Ids are fixed strings rather than generated, so a link into a detail page keeps working
 * across reloads and a screenshot taken today matches one taken next week.
 */

const now = "2026-08-17T09:00:00Z";

/**
 * The brands these rows trade under — **the ids only**; the records are in `brands.ts`.
 *
 * They live here because this is the file with no imports, and `brands.ts` derives its
 * `outlet_count` and `entity_count` from the rows below. Declaring them there instead would
 * make the two files import each other; writing the four literals out twice would be the
 * unchecked-duplicate-id class 1.36.2 closed. The brand is the third registry dimension, so
 * this is also where they belong.
 *
 * `brand_id` on every row below was `null` until now, and `contracts.ts` recorded the
 * consequence: *"the Brand column reads 'No brand yet' wherever there is coverage"*. That
 * was the honest rendering of an estate nobody had attributed. It stops being honest the
 * moment brand becomes the dimension the contracts table groups by — an unattributed estate
 * would collapse the whole screen into one bucket — so the attribution the outlet names
 * already imply is now written down.
 */
export const BRAND_IDS = {
  harbourTable: "b2000000-0000-4000-8000-000000000001",
  kopiCo: "b2000000-0000-4000-8000-000000000002",
  quayBar: "b2000000-0000-4000-8000-000000000003",
  eastside: "b2000000-0000-4000-8000-000000000004",
} as const;

export const entities: Entity[] = [
  {
    id: "e1000000-0000-4000-8000-000000000001",
    name: "Harbour Table Pte Ltd",
    uen: "201812345K",
    entity_type: "private_limited",
    status: "active",
    registered_address: "12 Marina View, #14-01, Singapore 018961",
    brand_id: BRAND_IDS.harbourTable,
    notes: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "e1000000-0000-4000-8000-000000000002",
    name: "Kopi & Co Holdings Pte Ltd",
    uen: "202033441C",
    entity_type: "private_limited",
    status: "active",
    registered_address: "8 Jalan Besar, #03-12, Singapore 208785",
    brand_id: BRAND_IDS.kopiCo,
    notes: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "e1000000-0000-4000-8000-000000000003",
    name: "Eastside Kitchens LLP",
    uen: "T21LL0987B",
    entity_type: "partnership",
    status: "dormant",
    registered_address: "50 Ubi Crescent, #05-04, Singapore 408568",
    brand_id: BRAND_IDS.eastside,
    notes: "Retained for the central kitchen lease only.",
    created_at: now,
    updated_at: now,
  },
];

export const outlets: Outlet[] = [
  {
    id: "01000000-0000-4000-8000-000000000001",
    slug: "harbour-table-marina",
    name: "Harbour Table — Marina",
    outlet_type: "restaurant",
    status: "open",
    entity_id: entities[0].id,
    brand_id: BRAND_IDS.harbourTable,
    address: "12 Marina View",
    unit: "#01-05",
    postal_code: "018961",
    attributes: ["serves_alcohol", "prepares_food", "outdoor_seating"],
    opening_date: "2024-03-01",
    target_opening_date: null,
    closing_date: null,
    notes: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "01000000-0000-4000-8000-000000000002",
    slug: "kopi-co-jalan-besar",
    name: "Kopi & Co — Jalan Besar",
    outlet_type: "cafe",
    status: "open",
    entity_id: entities[1].id,
    brand_id: BRAND_IDS.kopiCo,
    address: "8 Jalan Besar",
    unit: "#01-02",
    postal_code: "208785",
    attributes: ["prepares_food"],
    opening_date: "2023-09-15",
    target_opening_date: null,
    closing_date: null,
    notes: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "01000000-0000-4000-8000-000000000003",
    slug: "harbour-table-orchard",
    name: "Harbour Table — Orchard",
    outlet_type: "restaurant",
    status: "fitting_out",
    entity_id: entities[0].id,
    brand_id: BRAND_IDS.harbourTable,
    address: "391 Orchard Road",
    unit: "#04-18",
    postal_code: "238872",
    attributes: ["serves_alcohol", "prepares_food"],
    opening_date: null,
    target_opening_date: "2026-11-01",
    closing_date: null,
    notes: "Handover from landlord confirmed for September.",
    created_at: now,
    updated_at: now,
  },
  {
    id: "01000000-0000-4000-8000-000000000004",
    slug: "the-quay-bar",
    name: "The Quay Bar",
    outlet_type: "bar",
    status: "pipeline",
    entity_id: entities[0].id,
    brand_id: BRAND_IDS.quayBar,
    address: "60 Robertson Quay",
    unit: "#01-11",
    postal_code: "238252",
    attributes: ["serves_alcohol", "live_music"],
    opening_date: null,
    target_opening_date: "2027-02-15",
    closing_date: null,
    notes: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "01000000-0000-4000-8000-000000000005",
    slug: "eastside-central-kitchen",
    name: "Eastside Central Kitchen",
    outlet_type: "central_kitchen",
    status: "open",
    entity_id: entities[2].id,
    brand_id: BRAND_IDS.eastside,
    address: "50 Ubi Crescent",
    unit: "#05-04",
    postal_code: "408568",
    attributes: ["prepares_food"],
    opening_date: "2022-06-01",
    target_opening_date: null,
    closing_date: null,
    notes: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "01000000-0000-4000-8000-000000000006",
    slug: "kopi-co-tanjong-pagar",
    name: "Kopi & Co — Tanjong Pagar",
    outlet_type: "cafe",
    status: "temporarily_closed",
    entity_id: entities[1].id,
    brand_id: BRAND_IDS.kopiCo,
    address: "7 Wallich Street",
    unit: "#B1-09",
    postal_code: "078884",
    attributes: ["prepares_food"],
    opening_date: "2024-11-20",
    target_opening_date: null,
    closing_date: null,
    notes: "Closed for aircon replacement; reopening targeted for October.",
    created_at: now,
    updated_at: now,
  },
];
