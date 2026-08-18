import { describe, expect, it } from "vitest";

import {
  DEFAULT_TABLE_DENSITY,
  parseTableDensity,
  TABLE_DENSITIES,
  TABLE_DENSITY_CLASSES,
  TABLE_DENSITY_LABELS,
  type TableDensity,
} from "./table-density";

/**
 * The ladder, read back out of the class strings.
 *
 * This is the test the module's docstring points at, and it exists because of a constraint the
 * type system cannot express: the heights **have to be** literal Tailwind classes, so the only
 * place a number can live is inside a string. A ladder that does not descend is then a rendering
 * bug rather than a type error — three rungs that all say `h-12`, or a `cosy` cell padded wider
 * than `comfortable`, would compile and ship.
 *
 * So the numbers are parsed back here and asserted to descend. Tailwind's spacing scale is 4px
 * per unit, which is the one fact this file has to know that the module does not state.
 */

const SCALE = 4;

/** `h-12` → 48, `px-2.5` → 10. Returns `null` when the prefix is absent, which every assertion
 *  below treats as a failure rather than as a zero — a rung missing a height is the mistake this
 *  file is looking for, and a silent 0 would sort correctly. */
function measure(classes: string, prefix: string): number | null {
  const match = new RegExp(`(?:^| )${prefix}-([0-9.]+)(?: |$)`).exec(classes);
  return match ? Number(match[1]) * SCALE : null;
}

describe("the ladder", () => {
  it("holds a rung for every density and nothing else", () => {
    expect(Object.keys(TABLE_DENSITY_CLASSES).sort()).toEqual([...TABLE_DENSITIES].sort());
    expect(Object.keys(TABLE_DENSITY_LABELS).sort()).toEqual([...TABLE_DENSITIES].sort());
  });

  it("runs loosest to tightest, which is the order the control renders", () => {
    expect(TABLE_DENSITIES).toEqual(["comfortable", "cosy", "compact"]);
  });

  it.each([
    ["cell", "h"],
    ["cell", "px"],
    ["head", "h"],
    ["head", "px"],
    ["band", "h"],
    ["skeleton", "h"],
  ] as const)("descends strictly down %s %s-*", (slot, prefix) => {
    const measured = TABLE_DENSITIES.map((density) =>
      measure(TABLE_DENSITY_CLASSES[density][slot], prefix),
    );

    expect(measured.every((value) => value !== null)).toBe(true);
    for (let i = 1; i < measured.length; i += 1) {
      expect(measured[i]!).toBeLessThan(measured[i - 1]!);
    }
  });

  /**
   * The floor the module argues for, asserted rather than left in prose.
   *
   * `Badge` is `h-6` — 24px — and a CSS row height is a minimum, so a row carrying a status pill
   * cannot render shorter than the badge plus its own vertical padding. A tighter rung would
   * produce a table whose rows are two different heights depending on whether the cell holds a
   * pill, which is the failure the 32px floor exists to prevent.
   */
  it("does not go below the badge it has to contain", () => {
    const BADGE = 24;
    const tightest = TABLE_DENSITY_CLASSES[TABLE_DENSITIES[TABLE_DENSITIES.length - 1]];
    const height = measure(tightest.cell, "h")!;
    const padY = measure(tightest.cell, "py")!;

    expect(height).toBe(BADGE + 2 * padY);
  });

  /** The header may match the cell — `compact` puts both at 32px — but it must never be taller,
   *  or the head reads as a band. */
  it("keeps every header no taller than its own rows", () => {
    for (const density of TABLE_DENSITIES) {
      const rung = TABLE_DENSITY_CLASSES[density];
      expect(measure(rung.head, "h")!).toBeLessThanOrEqual(measure(rung.cell, "h")!);
    }
  });
});

describe("parseTableDensity", () => {
  it("accepts every rung", () => {
    for (const density of TABLE_DENSITIES) {
      expect(parseTableDensity(density)).toBe(density);
    }
  });

  /**
   * Everything storage can actually hold. `localStorage` survives a release, so the value read
   * back may be a rung this version has dropped, a key another app on the origin wrote, or the
   * literal string `"undefined"` that a careless `String(value)` leaves behind.
   */
  it.each([null, undefined, "", "COMFORTABLE", "cozy", "spacious", "undefined", "{}"])(
    "refuses %p",
    (value) => {
      expect(parseTableDensity(value)).toBeNull();
    },
  );
});

describe("the default", () => {
  /** The status quo, deliberately: this release adds a control, and a default that re-drew every
   *  table for readers who never touch it would be a redesign wearing a control's clothes. */
  it("is the 48px row the app already shipped", () => {
    const density: TableDensity = DEFAULT_TABLE_DENSITY;
    expect(density).toBe("comfortable");
    expect(measure(TABLE_DENSITY_CLASSES[density].cell, "h")).toBe(48);
  });

  it("is one of the rungs", () => {
    expect(TABLE_DENSITIES).toContain(DEFAULT_TABLE_DENSITY);
  });
});
