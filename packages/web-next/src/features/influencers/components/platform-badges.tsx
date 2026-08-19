"use client";

import type { InfluencerPlatform } from "@brandfactory/shared";
import * as React from "react";

import { NamesTooltip } from "@/components/layout/names-tooltip";
import { Badge } from "@/components/ui/badge";
import { INFLUENCER_PLATFORM_LABELS } from "@/lib/labels";

import { MAX_PLATFORM_BADGES, visiblePlatforms } from "../platforms";
import { INFLUENCER_PLATFORM_ICONS } from "./platform-icons";

/**
 * Where a creator posts, as a row of marks rather than as a sentence.
 *
 * ── What this replaces and why ────────────────────────────────────────────
 *
 * The cell read `Instagram, TikTok` with a bare ` +2` after three. A media list is scanned by
 * platform before it is read by name — *who is on TikTok* is the first question anybody asks of
 * one — and prose is the slowest possible answer: the reader parses a comma-separated sentence
 * per row, in a column where every row's sentence is a different length and starts with a
 * different word.
 *
 * ── The glyph is never alone, and it never becomes alone ──────────────────
 *
 * Badge = mark **plus label**, at every rung and on every surface. Six marks at 12px are not a
 * vocabulary anybody has learnt, and WCAG 1.4.1 does not let the glyph be the only carrier — the
 * rule `INFLUENCER_VERTICAL_ICONS` already follows one column over.
 *
 * **The compact rung does not drop the labels**, and that is the density ladder's own rule rather
 * than a preference here: `lib/table-density.ts` keeps type size off the ladder because *"height
 * is the one axis that changes how much fits without changing what any cell says"*. Hiding a word
 * at 32px rows would change what the cell says, so it would belong on a different control
 * entirely. There is no `labelHidden` escape hatch for that reason — the moment a column really
 * is too narrow for the words, the answer is `sr-only` plus a tooltip **on that caller**, and it
 * arrives with the caller that needs it.
 *
 * ── Outline, monochrome ───────────────────────────────────────────────────
 *
 * `variant="outline"` because these sit on the page canvas inside a card: `Badge`'s default fill
 * is `--surface-sunken`, which *is* the canvas, so it is invisible outside a white card. The mark
 * is `text-ink-tertiary` and never the platform's own colour — see `platform-icons.tsx` for the
 * argument, which is about the accent budget and is not a matter of taste.
 */

/** One platform, marked and named. */
export function PlatformBadge({ platform }: { platform: InfluencerPlatform }) {
  const Icon = INFLUENCER_PLATFORM_ICONS[platform];

  return (
    <Badge variant="outline" className="bg-surface">
      {/* `[&>svg]:size-3!` on the badge wins over the mark's own `1em`, which is the same
          treatment every lucide glyph in a badge gets. */}
      <Icon className="text-ink-tertiary" />
      {INFLUENCER_PLATFORM_LABELS[platform]}
    </Badge>
  );
}

/**
 * A creator's platforms, capped and with the rest behind a `+N`.
 *
 * The cap and the split are {@link visiblePlatforms}' — the only part of this column a test can
 * see. The order is whatever the caller handed over, which for every caller is `platformsOf`'s
 * enum order.
 *
 * **`flex-nowrap` and not `flex-wrap`.** A wrapped second line of badges makes one row taller than
 * the rest, which is exactly what the density ladder exists to stop: a rung sets a row *minimum*,
 * so content taller than the rung wins and the table ends up with two row heights depending on
 * which creator posts from four platforms. Three badges plus a `+N` is the widest this can be, and
 * the column takes the width it needs.
 */
export function PlatformBadges({
  platforms,
  max = MAX_PLATFORM_BADGES,
}: {
  platforms: readonly InfluencerPlatform[];
  max?: number;
}) {
  const { shown, overflow } = React.useMemo(
    () => visiblePlatforms(platforms, max),
    [platforms, max],
  );

  return (
    <span className="flex flex-nowrap items-center gap-1">
      {shown.map((platform) => (
        <PlatformBadge key={platform} platform={platform} />
      ))}
      {overflow.length > 0 ? (
        // The same construction the Brands cell uses one column over: a short label with the
        // names behind it, on a real button so keyboard focus opens it too. Nothing is hidden
        // from a reader who asks — which is what makes a cap honest rather than a truncation.
        //
        // No mark on this one. A `+3` is a count, and there is no seventh glyph that means "three
        // platforms" — putting one of the three overflowed marks on it would name one of them and
        // silently drop the other two.
        <NamesTooltip
          label={
            <Badge variant="outline" className="bg-surface">
              +{overflow.length}
            </Badge>
          }
          names={overflow.map((platform) => INFLUENCER_PLATFORM_LABELS[platform])}
        />
      ) : null}
    </span>
  );
}
