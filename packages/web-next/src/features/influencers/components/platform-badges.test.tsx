import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlatformBadges } from "./platform-badges";

/**
 * What the linked Platforms cell claims, checked where a browser pass cannot see it.
 *
 * A screen test is against this package's grain (`vitest.config.ts`: *"not the screens"*), and this
 * file earns its place the same way `reach-breakdown.test.tsx` does — the two claims here fail
 * **silently** in a browser:
 *
 * - **A badge with no stored URL must not become a link.** The rule is `profileUrlOn`'s and it is
 *   the one somebody reverses by writing a helpful `instagram.com/${handle}` template. On screen
 *   the result looks *better* than the correct behaviour — every badge clickable — and the damage
 *   is a link to a real stranger's profile, which nobody notices until they follow one.
 * - **`rel` must travel with `target="_blank"`.** A missing `noreferrer noopener` renders
 *   identically, behaves identically to the reader, and is invisible in a screenshot.
 *
 * **Plain DOM assertions, no `jest-dom`** — the note in `reach-breakdown.test.tsx` applies.
 */
describe("PlatformBadges", () => {
  it("links a badge to the profile the caller supplies, in a new tab", () => {
    render(
      <PlatformBadges
        platforms={["instagram"]}
        hrefFor={() => "https://www.instagram.com/jamiechua"}
      />,
    );

    const link = screen.getByRole("link", { name: /Instagram/ });
    expect(link.getAttribute("href")).toBe("https://www.instagram.com/jamiechua");
    expect(link.getAttribute("target")).toBe("_blank");
    // Both tokens, and `noopener` is the one that matters: a `_blank` link without it hands the
    // opened page a live `window.opener` back into this app.
    expect(link.getAttribute("rel")).toBe("noreferrer noopener");
    // The mark and the word are still both there — the badge is not replaced by a bare link, it
    // *becomes* one, which is what keeps WCAG 1.4.1 satisfied on a column of glyphs.
    expect(link.textContent).toContain("Instagram");
    expect(link.querySelector("svg")).not.toBe(null);
    // The new tab is announced rather than left for a sighted reader to infer from the cursor.
    expect(link.textContent).toContain("Opens the profile in a new tab");
  });

  it("renders a plain badge when there is no URL for that platform", () => {
    render(<PlatformBadges platforms={["tiktok"]} hrefFor={() => null} />);

    expect(screen.queryByRole("link")).toBe(null);
    expect(screen.getByText("TikTok")).not.toBe(null);
  });

  it("renders a plain badge when the caller passes no `hrefFor` at all", () => {
    // The default, and the shape every pre-existing caller keeps: the detail page draws this badge
    // beside a handle that already carries the link.
    render(<PlatformBadges platforms={["youtube"]} />);

    expect(screen.queryByRole("link")).toBe(null);
  });

  it("asks for a link per shown platform and not for the overflowed ones", () => {
    // `MAX_PLATFORM_BADGES` is 2, so the third platform is inside the `+N` tooltip — which is not
    // a place to put a link, because it closes on the way to one. This pins that the cell does not
    // pay for a URL it cannot render.
    const asked: string[] = [];
    render(
      <PlatformBadges
        platforms={["instagram", "tiktok", "youtube"]}
        hrefFor={(platform) => {
          asked.push(platform);
          return `https://example.test/${platform}`;
        }}
      />,
    );

    expect(asked).toEqual(["instagram", "tiktok"]);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
