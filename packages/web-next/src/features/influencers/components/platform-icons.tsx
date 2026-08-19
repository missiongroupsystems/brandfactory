import type { InfluencerPlatform } from "@brandfactory/shared";
import type * as React from "react";

/**
 * A mark per platform — six inline SVGs, and **not a dependency**.
 *
 * ── Why they are drawn here ───────────────────────────────────────────────
 *
 * `lucide-react` is this repo's only icon package and it ships no brand marks, deliberately: a
 * trademark is not a pictogram and Lucide does not distribute them. The alternatives were a
 * second icon dependency for six shapes, or six shapes. `INFLUENCER_PLATFORM_LABELS` records the
 * decision this replaces — *"a generic glyph per platform (a camera for Instagram, a play button
 * for YouTube) would be six symbols that name a medium rather than a service"* — which was right,
 * and is the reason these are the platforms' own marks rather than nearest-neighbour pictograms.
 *
 * The marks identify the platforms they name, which is the use a trademark exists for.
 *
 * ── Monochrome, and that is a decision rather than a shortcut ─────────────
 *
 * Every mark is `fill="currentColor"` at one path, so the colour comes from the badge around it —
 * `text-ink-tertiary`, never the platforms' own hues. Six saturated brand colours repeated down a
 * column turns a data column into a logo wall, and it spends the accent budget AGENTS.md fixes at
 * one primary button, one accent card and the selected control state, many times over. **The
 * colour on this screen belongs to the brand this product is for, not to the six it reads from.**
 * Do not reintroduce the brand colours; that is what this paragraph is here to stop.
 *
 * ── Sizing and accessibility ──────────────────────────────────────────────
 *
 * `1em` square, so a mark takes the size of the text beside it wherever it is dropped. Inside a
 * `Badge` the `[&>svg]:size-3!` rule wins and pins it at 12px, which is the same treatment every
 * lucide glyph in a badge gets.
 *
 * **`aria-hidden` throughout, without exception.** A mark is never the accessible name of
 * anything: `PlatformBadges` always renders the label beside it, as real text or as `sr-only`
 * text, which is the rule `INFLUENCER_VERTICAL_ICONS` already follows and the reason is WCAG
 * 1.4.1. A glyph that carried the name alone would leave "Xiaohongshu" and "Facebook" as two
 * unnamed squares to a screen reader.
 */

type PlatformIconProps = React.SVGProps<SVGSVGElement>;

/** The frame every mark shares — 24-unit box, sized in `em`, filled from the text colour. */
function Mark({ children, ...props }: PlatformIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** The camera outline: rounded frame, lens ring, flash dot. */
function InstagramIcon(props: PlatformIconProps) {
  return (
    <Mark {...props}>
      {/* `evenodd` rather than winding direction, on every mark that has a hole in it. A ring
          built out of two subpaths drawn the same way is a solid blob under the default
          `nonzero` rule, and the failure is invisible until it renders. */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"
      />
      <path d="M17.4 5.4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Z" />
    </Mark>
  );
}

/** The note with the tail. */
function TikTokIcon(props: PlatformIconProps) {
  return (
    <Mark {...props}>
      <path d="M16.6 1.5h-3.4v14.2a2.9 2.9 0 0 1-2.9 2.9 2.9 2.9 0 0 1-2.9-2.9 2.9 2.9 0 0 1 2.9-2.9c.3 0 .6 0 .9.1V9.4a6.6 6.6 0 0 0-.9-.1A6.4 6.4 0 0 0 3.9 15.7a6.4 6.4 0 0 0 6.4 6.4 6.4 6.4 0 0 0 6.4-6.4V8.4a8 8 0 0 0 4.7 1.5V6.4a4.6 4.6 0 0 1-2.9-1.2 4.7 4.7 0 0 1-1.9-3.7Z" />
    </Mark>
  );
}

/** The rounded screen with the play triangle knocked out. */
function YouTubeIcon(props: PlatformIconProps) {
  return (
    <Mark {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M23.5 6.5a3 3 0 0 0-2.12-2.13C19.5 3.86 12 3.86 12 3.86s-7.5 0-9.38.51A3 3 0 0 0 .5 6.5C0 8.39 0 12 0 12s0 3.61.5 5.5a3 3 0 0 0 2.12 2.13c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51A3 3 0 0 0 23.5 17.5c.5-1.89.5-5.5.5-5.5s0-3.61-.5-5.5ZM9.6 15.6V8.4L15.9 12l-6.3 3.6Z"
      />
    </Mark>
  );
}

/**
 * The open book.
 *
 * **The one mark that is not a trademark**, and it is stated rather than left to be discovered.
 * Xiaohongshu's own mark is a Chinese wordmark — 小红书, "little red book" — which does not survive
 * being drawn at 12px in one colour. What the app *is* survives: a book. The label carries the
 * name in every place this renders, so the glyph is a scanning aid rather than an identifier.
 */
function XiaohongshuIcon(props: PlatformIconProps) {
  return (
    <Mark {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 3.5h5.5A3 3 0 0 1 12 4.8a3 3 0 0 1 2.5-1.3H20a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-5.5a1.5 1.5 0 0 0-1.4 1 1.2 1.2 0 0 1-2.2 0 1.5 1.5 0 0 0-1.4-1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Zm7 3.6a1.9 1.9 0 0 0-1.5-1.6H5v11h4.6c.5 0 1 .1 1.4.3V7.1Zm2 9.7c.4-.2.9-.3 1.4-.3H19v-11h-4.5A1.9 1.9 0 0 0 13 7.1v9.7Z"
      />
    </Mark>
  );
}

/** The circle with the f knocked out. */
function FacebookIcon(props: PlatformIconProps) {
  return (
    <Mark {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm-1.8 21.3V14H8v-2.9h2.2V9.2c0-2.5 1.5-3.9 3.8-3.9.86 0 1.7.06 2.5.16V8h-1.2c-1.2 0-1.5.57-1.5 1.4v1.7h2.6l-.4 2.9h-2.2v7.3h-3.6Z"
      />
    </Mark>
  );
}

/** The rounded square with `in` knocked out. */
function LinkedInIcon(props: PlatformIconProps) {
  return (
    <Mark {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.2 0h19.6A2.2 2.2 0 0 1 24 2.2v19.6a2.2 2.2 0 0 1-2.2 2.2H2.2A2.2 2.2 0 0 1 0 21.8V2.2A2.2 2.2 0 0 1 2.2 0Zm3.3 3.4a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2ZM3.7 20.4h3.6V9.2H3.7v11.2Zm5.8 0h3.6v-5.6c0-1.5.3-2.9 2.1-2.9 1.8 0 1.8 1.7 1.8 3v5.5h3.6v-6.3c0-3.1-.7-5.4-4.3-5.4-1.7 0-2.9.95-3.3 1.85h-.05V9.2H9.5v11.2Z"
      />
    </Mark>
  );
}

/**
 * The map the badge reads, keyed by the union — so a seventh platform in
 * `InfluencerPlatformSchema` fails the typecheck here until somebody has drawn its mark, exactly
 * as `INFLUENCER_PLATFORM_LABELS` fails until somebody has named it.
 */
export const INFLUENCER_PLATFORM_ICONS: Record<
  InfluencerPlatform,
  (props: PlatformIconProps) => React.JSX.Element
> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YouTubeIcon,
  xiaohongshu: XiaohongshuIcon,
  facebook: FacebookIcon,
  linkedin: LinkedInIcon,
};
