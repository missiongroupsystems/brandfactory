"use client";

import type { InfluencerPlatform } from "@brandfactory/shared";
import * as React from "react";

import { NamesTooltip } from "@/components/layout/names-tooltip";
import { Badge } from "@/components/ui/badge";
import { INFLUENCER_PLATFORM_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

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

/**
 * One platform, marked and named — and clickable when the record holds a URL for it.
 *
 * ── The link is opt-in, and it is the caller's to supply ──────────────────
 *
 * `href` is `null` by default and every existing caller keeps it that way. The detail page draws
 * this badge beside a handle that already carries the link, so a second link to the same page in
 * the same row would be two tab stops to one destination. The roster's Platforms cell has no
 * handle beside it — the badge is the only thing there — which is why it is the one caller that
 * passes an `href`.
 *
 * **Nothing here derives a URL.** See `profileUrlOn` for the rule; a badge with no stored URL is
 * the plain `span` this component has always rendered, not a dead link.
 *
 * ── A new tab, and the badge says so ──────────────────────────────────────
 *
 * `target="_blank"` with `rel="noreferrer noopener"`, matching the account links on the detail
 * page: the reader is leaving this app for somebody else's site, and a media list is read by
 * opening several profiles beside each other rather than one at a time. WCAG 3.2.5 wants that
 * announced, so the mark is paired with an `sr-only` line — the same construction the detail
 * page's handle link uses, so the two surfaces say the same sentence.
 *
 * **No external-link glyph.** The detail page needs one because three handles sit in a column and
 * only some are clickable; here the whole badge is the control, its hover state covers the mark
 * and the word together, and a third glyph inside a 24px pill next to a `+N` would cost more
 * width than the column has — `MAX_PLATFORM_BADGES` is 2 for that reason.
 */
export function PlatformBadge({
  platform,
  href = null,
}: {
  platform: InfluencerPlatform;
  /** The profile to open in a new tab. `null` keeps the badge plain text. */
  href?: string | null;
}) {
  const Icon = INFLUENCER_PLATFORM_ICONS[platform];
  const label = INFLUENCER_PLATFORM_LABELS[platform];

  return (
    <Badge
      variant="outline"
      // `hover:` on the two colour tokens rather than a `variant` of its own: a linked badge is
      // the same pill as an unlinked one until the pointer is on it, because the column is read
      // down its length and a permanently different-looking badge would read as a different
      // *platform state* rather than as a link.
      className={cn("bg-surface", href && "hover:border-brand hover:text-brand")}
      render={
        href ? (
          <a href={href} target="_blank" rel="noreferrer noopener" title={`Open on ${label}`} />
        ) : undefined
      }
    >
      {/* `[&>svg]:size-3!` on the badge wins over the mark's own `1em`, which is the same
          treatment every lucide glyph in a badge gets. */}
      <Icon className="text-ink-tertiary" />
      {label}
      {href ? <span className="sr-only">Opens the profile in a new tab</span> : null}
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
 * which creator posts from four platforms. Two badges plus a `+N` is the widest this can be, and
 * that bound is what lets the column carry a fixed share of the table instead of an organic one —
 * see `MAX_PLATFORM_BADGES` in `../platforms.ts`.
 *
 * **`hrefFor` is asked per shown platform, and only per shown platform.** The overflow platforms
 * stay inside the `+N` tooltip as names, because a tooltip is not a place to put links: it closes
 * on the way to them. A reader who wants the third platform's profile opens the record, which is
 * where every account is listed with its own link.
 */
export function PlatformBadges({
  platforms,
  max = MAX_PLATFORM_BADGES,
  hrefFor,
}: {
  platforms: readonly InfluencerPlatform[];
  max?: number;
  /**
   * Where each badge links, or `null` for a plain badge. Omitted entirely by a caller whose
   * surface already carries the link — see `PlatformBadge`.
   */
  hrefFor?: (platform: InfluencerPlatform) => string | null;
}) {
  const { shown, overflow } = React.useMemo(
    () => visiblePlatforms(platforms, max),
    [platforms, max],
  );

  return (
    <span className="flex flex-nowrap items-center gap-1">
      {shown.map((platform) => (
        <PlatformBadge key={platform} platform={platform} href={hrefFor?.(platform) ?? null} />
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
