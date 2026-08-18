import { usePassportLinkage } from '@/components/passport/linkage'

/**
 * The rail's version of `LocalOnlyBadge` — a dot, plus the brand's accessible name.
 *
 * Plan: phase 8f. Decision: proposal §8 `D1-b`.
 *
 * A 36px monogram tile has nowhere to put the words "local only", so the visual signal is a
 * 8px dot on the tile's corner and the *text* rides on the accessible name. Both this and the
 * badge are gated the same way — see `LocalOnlyBadge` for why the gate exists at all — so the
 * rail and the switcher cannot end up disagreeing about which brands are local.
 *
 * **It also owns the tile's `sr-only` name**, and that is deliberate rather than convenient.
 * The name and the state have to be one string: a screen reader reading "Casa Vostra" from one
 * element and "local only" from a sibling gives no reliable ordering, and in a list of forty
 * tiles the suffix could attach itself to the wrong brand. One node, one label.
 */
export function LocalOnlyDot({ linked, name }: { linked: boolean; name: string }) {
  // Called unconditionally, BEFORE the `linked` test. `!linked && usePassportLinkage()`
  // short-circuits, which makes the hook conditional and changes hook order the moment a
  // brand links — a rules-of-hooks violation the linter caught here.
  const meaningful = usePassportLinkage()
  // Same gate as the badge: with no Passport in play, every brand is local and the signal is
  // noise on every tile in the rail. See `./linkage`.
  const local = !linked && meaningful

  return (
    <>
      <span className="sr-only">{local ? `${name} (local only)` : name}</span>
      {local ? (
        // `ring-card` matches the rail's background, so the dot reads as sitting ON the tile
        // rather than being part of the monogram — the mark's colours are the customer's and
        // an unringed dot would look like a design element of the brand itself.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-muted-foreground ring-2 ring-card"
        />
      ) : null}
    </>
  )
}
