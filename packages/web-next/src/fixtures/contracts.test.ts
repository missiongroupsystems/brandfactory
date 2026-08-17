import { describe, expect, it } from "vitest";

import { CONTRACT_CATEGORY_ICONS, CONTRACT_CATEGORY_LABELS } from "@/lib/labels";

import { brands } from "./brands";
import { contracts, isCurrent, vendors } from "./contracts";
import { agencies } from "./influencers";
import { entities, outlets } from "./registry";

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

  it("points every vendor and brand reference at a row that exists", () => {
    const vendorIds = new Set(vendors.map((vendor) => vendor.id));
    const brandIds = new Set(brands.map((brand) => brand.id));

    for (const contract of contracts) {
      expect(vendorIds).toContain(contract.vendor_id);
      for (const brandId of contract.brand_ids) expect(brandIds).toContain(brandId);
    }
  });

  it("gives every category in the vocabulary a glyph and a word it can be read by", () => {
    // Not a coverage assertion — `other` is deliberately unused, and the reason is in the
    // AGREEMENTS docstring. What this pins is the weaker, load-bearing half: no row carries a
    // category the label and icon maps cannot render, which is how a table ends up drawing
    // `undefined` where a glyph should be.
    for (const contract of contracts) {
      expect(CONTRACT_CATEGORY_LABELS[contract.category]).toBeTruthy();
      expect(CONTRACT_CATEGORY_ICONS[contract.category]).toBeTruthy();
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
  it("holds a row for each of the three brand shapes the cell renders", () => {
    const sizes = contracts.map((contract) => contract.brand_ids.length);
    // Group level, a single name, and the glyph-and-count. Each is a different branch of
    // `BrandCell`, and a fixture missing one leaves that branch unseen in a browser pass.
    expect(sizes.some((size) => size === 0)).toBe(true);
    expect(sizes.some((size) => size === 1)).toBe(true);
    expect(sizes.some((size) => size > 1)).toBe(true);
  });

  it("holds an agreement against a retired brand, which the filter must not hide", () => {
    // Retiring a brand does not un-sign what was signed for it. The brand filter offers
    // retired brands for exactly this row, so a fixture without one would let that rule
    // regress without a test noticing.
    const retired = brands.filter((brand) => brand.status === "retired").map((b) => b.id);
    expect(retired.length).toBeGreaterThan(0);
    expect(
      contracts.some((contract) => contract.brand_ids.some((id) => retired.includes(id))),
    ).toBe(true);
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
      expect(vendor.brands_covered).toBe(
        new Set(active.flatMap((contract) => contract.brand_ids)).size,
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

describe("the brand fixture", () => {
  it("derives each brand's counts from the rows that name it, never from a literal", () => {
    // The property `contracts.ts` states for the vendor aggregates, one dimension over: two
    // screens may not disagree about a number, and the way to keep them agreeing is to
    // compute one from the other rather than to type it twice.
    for (const brand of brands) {
      expect(brand.outlet_count).toBe(
        outlets.filter((outlet) => outlet.brand_id === brand.id).length,
      );
      expect(brand.entity_count).toBe(
        entities.filter((entity) => entity.brand_id === brand.id).length,
      );
    }
  });

  it("attributes every outlet, so grouping by brand is not one bucket", () => {
    // The state this replaced: every outlet at `brand_id: null`, which collapsed the whole
    // contracts table into "Group level" the moment brand became the grouping.
    expect(outlets.every((outlet) => outlet.brand_id !== null)).toBe(true);
  });
});
