import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * BrandMark — the brand's monogram.
 *
 * A brand row carries no logo and no colour (`BrandRead` is six fields and a name), so the
 * mark is *derived*: initials from the name, hue from the id. Every brand that exists gets a
 * mark on the next page load, with no upload path and no migration.
 *
 * Ported from the Vite app's `components/brand/BrandMark.tsx`, minus its `src` prop — the
 * declared-logo branch, which needs brand assets this shell has no fixture for. The geometry
 * and the two pure functions are the same, so the two marks agree while both apps exist.
 *
 * **On the accent budget (§4).** The CI keeps colour scarce so the one brand green stays
 * meaningful, and this hue is not that green — it is the *customer's* brand, the one thing on
 * screen allowed to look like itself. It appears on exactly one element per surface, which is
 * why the switcher's menu rows are names only and the mark sits on the trigger alone.
 */

/**
 * Initials for the monogram. Two letters for a multi-word name, one for a single word —
 * "BR" for "BrandFactory" reads as an abbreviation of nothing, where "B" reads as a mark.
 *
 * Split by code point, not by index: `"🌱 Sprout"[0]` is half a surrogate pair and renders as
 * a replacement character.
 */
export function brandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const [firstWord = "", secondWord = ""] = words;
  const first = [...firstWord][0] ?? "";
  if (words.length === 1) return first.toUpperCase();
  const second = [...secondWord][0] ?? "";
  return (first + second).toUpperCase();
}

/**
 * A stable hue in [0, 360) from the brand id. The id rather than the name, so a rename does
 * not recolour a brand the user has learned to recognise by its mark.
 *
 * FNV-1a-ish: a plain `charCodeAt` sum collides constantly on names sharing letters, which on
 * a workspace of sibling brands is exactly the case that matters.
 */
export function brandHue(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

const SIZES = {
  sm: "size-8 rounded-md text-xs",
  md: "size-9 rounded-[10px] text-sm",
  lg: "size-14 rounded-xl text-lg",
} as const;

export interface BrandMarkProps {
  name: string;
  /** Hue source. The brand id — see {@link brandHue}. */
  seed: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function BrandMark({ name, seed, size = "md", className }: BrandMarkProps) {
  // `aria-hidden`, always: the mark restates the brand name, which is rendered as text beside
  // it on every surface that uses this. Announcing "HT" before "Harbour Table" is noise.
  return (
    <div
      aria-hidden="true"
      style={{ "--brand-hue": brandHue(seed) } as React.CSSProperties}
      className={cn(
        "brand-mark flex shrink-0 items-center justify-center overflow-hidden font-medium tracking-tight select-none",
        SIZES[size],
        className,
      )}
    >
      {brandInitials(name)}
    </div>
  );
}
