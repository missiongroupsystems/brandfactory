import type { DashboardSummary } from "@/lib/api/types";
import { licenses } from "./licenses";
import { outlets } from "./registry";

/**
 * The attention surface. Sized so every panel on the dashboard has something in it —
 * an empty panel tells you nothing about the layout, which is the point of this pass.
 *
 * `days_until_due` is negative for the overdue rows, which is how the source app
 * distinguishes them from `due_soon` without a second field.
 */
export const dashboard: DashboardSummary = {
  counts: {
    overdue: 1,
    open_obligations: 11,
    due_30: 3,
    due_60: 5,
    due_90: 8,
  },
  overdue: [
    {
      id: "0b000000-0000-4000-8000-000000000001",
      title: "Renew COMPASS Music Licence — Kopi & Co, Jalan Besar",
      kind: "renewal",
      status: "open",
      due_date: "2026-03-01",
      days_until_due: -169,
      lead_time_days: 30,
      subject_id: licenses[3].id,
      subject_type: "license",
      outlet_id: outlets[1].id,
      entity_id: null,
      assignee_user_id: null,
      auto_generated: true,
    },
  ],
  due_soon: [
    {
      id: "0b000000-0000-4000-8000-000000000003",
      title: "Renew Liquor Licence — Harbour Table, Marina",
      kind: "renewal",
      status: "in_progress",
      due_date: "2026-09-29",
      days_until_due: 43,
      lead_time_days: 45,
      subject_id: licenses[1].id,
      subject_type: "license",
      outlet_id: outlets[0].id,
      entity_id: null,
      assignee_user_id: null,
      auto_generated: true,
    },
    {
      id: "0b000000-0000-4000-8000-000000000004",
      title: "Fire safety inspection — Harbour Table, Orchard",
      kind: "inspection",
      status: "open",
      due_date: "2026-10-06",
      days_until_due: 50,
      lead_time_days: 14,
      subject_id: licenses[4].id,
      subject_type: "license",
      outlet_id: outlets[2].id,
      entity_id: null,
      assignee_user_id: null,
      auto_generated: true,
    },
    {
      id: "0b000000-0000-4000-8000-000000000005",
      title: "Food hygiene refresher due for two staff — Kopi & Co, Jalan Besar",
      kind: "training",
      status: "open",
      due_date: "2026-11-02",
      days_until_due: 77,
      lead_time_days: 30,
      subject_id: outlets[1].id,
      subject_type: "outlet",
      outlet_id: outlets[1].id,
      entity_id: null,
      assignee_user_id: null,
      auto_generated: false,
    },
  ],
  gaps: [
    {
      outlet_id: outlets[2].id,
      outlet_name: outlets[2].name,
      outlet_status: outlets[2].status,
      outstanding: 4,
      mandatory_outstanding: 2,
      past_target: 0,
    },
    {
      outlet_id: outlets[3].id,
      outlet_name: outlets[3].name,
      outlet_status: outlets[3].status,
      outstanding: 6,
      mandatory_outstanding: 3,
      past_target: 0,
    },
  ],
  pipeline: [
    {
      outlet_id: outlets[2].id,
      outlet_name: outlets[2].name,
      outlet_status: outlets[2].status,
      target_opening_date: outlets[2].target_opening_date,
      required: 7,
      met: 3,
      outstanding: 4,
      mandatory_outstanding: 2,
      past_target: 0,
    },
    {
      outlet_id: outlets[3].id,
      outlet_name: outlets[3].name,
      outlet_status: outlets[3].status,
      target_opening_date: outlets[3].target_opening_date,
      required: 9,
      met: 3,
      outstanding: 6,
      mandatory_outstanding: 3,
      past_target: 0,
    },
  ],
  // Empty, and it is the concept that went rather than the data. Service health was a verdict
  // over `(contract, outlet)` pairs, and a contract in this product is held for a brand and
  // names no outlet — so there is nothing left to compute. The panel guards on `length`, so it
  // renders nothing rather than an empty box. The field stays because `DashboardSummary` is
  // generated and frozen.
  service_health: [],
  unscheduled: [
    {
      license_id: licenses[4].id,
      license_type_name: "Fire Safety Certificate",
      license_status: licenses[4].status,
      outlet_id: outlets[2].id,
      outlet_name: outlets[2].name,
      expiry_date: null,
      reason: "no_expiry_date",
    },
    {
      license_id: licenses[0].id,
      license_type_name: "Food Shop Licence",
      license_status: licenses[0].status,
      outlet_id: outlets[0].id,
      outlet_name: outlets[0].name,
      expiry_date: licenses[0].expiry_date,
      reason: "no_lead_time",
    },
  ],
};
