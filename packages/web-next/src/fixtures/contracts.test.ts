import { describe, expect, it } from "vitest";

import { contracts, isCurrent, vendors } from "./contracts";
import { agencies } from "./influencers";
import { outlets } from "./registry";

/**
 * What a browser pass cannot see about this fixture.
 *
 * The rows themselves are judged by looking at the screen — that is what they are for. What is
 * asserted here is the part that stays wrong while looking right: a notice deadline a day out
 * still renders as a date, a vendor claiming "1 active of 4" over a list of five still renders
 * as a badge, and a dangling `renewed_by_id` still renders as the word "Renewed". All three are
 * numbers two screens have to agree on, which is the rule `influencers.ts` shipped its zeroes
 * for and the reason they are now derived instead of typed.
 */

describe("the contract fixture's shape", () => {
  it("carries the `value` key on every row, including where no figure was agreed", () => {
    // `hasContractValue()` narrows on the key's *presence*. A row that omitted it would claim
    // "a figure is on file and you may not see it" about a contract that has none.
    for (const contract of contracts) {
      expect(contract).toHaveProperty("value");
      expect(contract.has_value).toBe(contract.value !== null);
    }
  });

  it("points every vendor and outlet reference at a row that exists", () => {
    const vendorIds = new Set(vendors.map((vendor) => vendor.id));
    const outletIds = new Set(outlets.map((outlet) => outlet.id));

    for (const contract of contracts) {
      expect(vendorIds).toContain(contract.vendor_id);
      for (const outletId of contract.outlet_ids) expect(outletIds).toContain(outletId);
    }
  });

  it("links the renewal pair in both directions", () => {
    const byId = new Map(contracts.map((contract) => [contract.id, contract]));

    for (const contract of contracts) {
      if (contract.renewed_by_id) {
        expect(byId.get(contract.renewed_by_id)?.renewed_from_id).toBe(contract.id);
      }
      if (contract.renewed_from_id) {
        expect(byId.get(contract.renewed_from_id)?.renewed_by_id).toBe(contract.id);
      }
    }
  });

  it("counts back to the notice date from the end date, in UTC", () => {
    for (const contract of contracts) {
      if (contract.renewal_type !== "auto" || contract.notice_period_days == null) continue;
      expect(contract.end_date).not.toBeNull();

      const due = Date.parse(`${contract.notice_due_date}T00:00:00Z`);
      const end = Date.parse(`${contract.end_date}T00:00:00Z`);
      expect((end - due) / 86_400_000).toBe(contract.notice_period_days);
    }
  });
});

describe("what the table's branches need on screen", () => {
  it("holds a row for each of the three coverage shapes", () => {
    const sizes = contracts.map((contract) => contract.outlet_ids.length);
    expect(sizes.some((size) => size === 0)).toBe(true);
    expect(sizes.some((size) => size === 1)).toBe(true);
    expect(sizes.some((size) => size > 1)).toBe(true);
  });

  it("holds coverage spanning two holding companies, which is the merged column's case", () => {
    const entityOf = (outletId: string) =>
      outlets.find((outlet) => outlet.id === outletId)?.entity_id;
    const spans = contracts.some(
      (contract) => new Set(contract.outlet_ids.map(entityOf)).size > 1,
    );
    expect(spans).toBe(true);
  });

  it("holds the notice gap, which is the only row `?notice_gap=true` returns", () => {
    const gaps = contracts.filter(
      (contract) => contract.renewal_type === "auto" && contract.notice_period_days == null,
    );
    expect(gaps.length).toBeGreaterThan(0);
  });

  it("holds an expiry nobody has answered, so the Status cell renders its two buttons", () => {
    const owed = contracts.filter(
      (contract) =>
        contract.status === "expired" && !contract.renewed_by_id && !contract.closed_at,
    );
    expect(owed.length).toBeGreaterThan(0);
  });

  it("hides resolved history from Current and shows it under All", () => {
    const hidden = contracts.filter((contract) => !isCurrent(contract));
    // Both resolutions, because the Status cell prints different words for each.
    expect(hidden.map((contract) => contract.status).sort()).toEqual(["expired", "terminated"]);
    // The unresolved expiry is *not* among them — hiding it is how a decision gets lost.
    expect(contracts.filter(isCurrent).some((contract) => contract.status === "expired")).toBe(
      true,
    );
  });
});

describe("the vendor aggregates", () => {
  it("keeps every agency and adds the providers only a contract makes exist", () => {
    for (const agency of agencies) {
      expect(vendors.find((vendor) => vendor.id === agency.id)?.name).toBe(agency.name);
    }
    expect(vendors.length).toBeGreaterThan(agencies.length);
  });

  it("never claims a count the contracts list would contradict", () => {
    for (const vendor of vendors) {
      const held = contracts.filter((contract) => contract.vendor_id === vendor.id);
      const active = held.filter((contract) => contract.status === "active");

      expect(vendor.contracts_total).toBe(held.length);
      expect(vendor.contracts_active).toBe(active.length);
      expect(vendor.contracts_active).toBeLessThanOrEqual(vendor.contracts_total);
      expect(vendor.outlets_covered).toBe(
        new Set(active.flatMap((contract) => contract.outlet_ids)).size,
      );
    }
  });

  it("puts the next decision date at the earliest active end, or nowhere", () => {
    for (const vendor of vendors) {
      const ends = contracts
        .filter((contract) => contract.vendor_id === vendor.id && contract.status === "active")
        .map((contract) => contract.end_date)
        .filter((end): end is string => end !== null)
        .sort();
      expect(vendor.next_contract_end ?? null).toBe(ends[0] ?? null);
    }
  });
});
