"use client";

import { Presentation } from "lucide-react";
import Link from "next/link";

import { brandNavHref } from "@/components/layout/nav";
import type { DeckWithVersions } from "@/features/decks/api";
import { formatDate } from "@/lib/format";

import { SectionHeading } from "./section-heading";

/**
 * The brand's decks, as a strip of cards linking through to the full list and version history.
 *
 * `visual-identity-band.tsx`'s rule exactly: **render nothing when the brand has nothing**, so a
 * brand that has not started does not get a heading over an empty rectangle. `decks` arrives as a
 * prop rather than through its own `useDecks(brandId)` call, on the same shape `VisualIdentityBand`
 * takes `profile.colours` / `profile.typefaces` as props — `BrandProfileScreen` is the one place
 * that decides whether "Decks" belongs in the *On this page* rail, and that decision needs the same
 * fetch this band renders from, so the screen makes the one call and hands both the count and the
 * band their answer.
 */
export function DecksBand({
  brandId,
  decks,
  anchor,
}: {
  brandId: string;
  decks: DeckWithVersions[];
  anchor: string;
}) {
  if (decks.length === 0) return null;

  return (
    <section aria-labelledby={anchor} className="flex flex-col gap-4">
      <SectionHeading id={anchor} icon={Presentation} title="Decks" />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((deck) => (
          <li key={deck.id}>
            <Link
              href={brandNavHref(brandId, "decks")}
              className="flex h-full flex-col gap-1 rounded-xl border border-border bg-card p-4 shadow-e1 transition-colors duration-[120ms] hover:border-border-strong"
            >
              <span className="font-medium text-ink">{deck.name}</span>
              <span className="text-helper text-ink-secondary">
                {deck.current
                  ? `${deck.current.label} · ${formatDate(deck.current.versionDate)}`
                  : "No versions yet"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
