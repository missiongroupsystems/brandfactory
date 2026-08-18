import { describe, expect, it } from "vitest";

import { formatEngagement, formatFollowers, toNullableNumber } from "./format";

describe("formatEngagement", () => {
  it("always shows one decimal, so a whole rate does not read as another measurement", () => {
    // The trap this rule exists for: `2.00` in a `numeric(5,2)` column arrives as
    // the number `2`, and `2%` in a column of `3.8%` looks like a different kind of
    // figure rather than the same one.
    expect(formatEngagement(2)).toBe("2.0%");
  });

  it("keeps a measured decimal", () => {
    expect(formatEngagement(3.8)).toBe("3.8%");
    expect(formatEngagement(14.2)).toBe("14.2%");
  });

  it("rounds to the one decimal it promises", () => {
    expect(formatEngagement(3.46)).toBe("3.5%");
  });

  it("renders a measured zero rather than treating it as absent", () => {
    // 0% engagement is a measurement. Only `null` means nobody has measured, and
    // conflating the two is what `Number(null) === 0` would have done in the mapper.
    expect(formatEngagement(0)).toBe("0.0%");
  });

  it("hands back null so the caller renders its own empty state", () => {
    expect(formatEngagement(null)).toBeNull();
  });
});

describe("formatFollowers", () => {
  it("groups the full figure rather than rounding it", () => {
    expect(formatFollowers(1_240_000)).toBe("1,240,000");
    expect(formatFollowers(84_200)).toBe("84,200");
  });

  it("leaves a small count alone", () => {
    expect(formatFollowers(931)).toBe("931");
  });

  it("holds a zero, which is a real reading for a brand-new account", () => {
    expect(formatFollowers(0)).toBe("0");
  });
});

describe("toNullableNumber", () => {
  it("keeps a typed zero as a measurement", () => {
    // The whole reason this is not `toNullable`. That one tests the trimmed string for
    // truthiness, so `"0"` would come back as `null` and a creator measured at zero engagement
    // would be stored as one nobody has measured.
    expect(toNullableNumber("0")).toBe(0);
  });

  it("turns an untouched field into null rather than into zero", () => {
    // `Number("")` is `0`. A form that sent that would state a measurement nobody made.
    expect(toNullableNumber("")).toBeNull();
    expect(toNullableNumber("   ")).toBeNull();
  });

  it("parses a decimal rate", () => {
    expect(toNullableNumber("3.8")).toBe(3.8);
  });

  it("falls to null rather than to NaN, so the payload says what it means", () => {
    expect(toNullableNumber("not a number")).toBeNull();
  });
});
