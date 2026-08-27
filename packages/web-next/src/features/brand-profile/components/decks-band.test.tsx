import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DecksBand } from "./decks-band";

/**
 * `visual-identity-band.tsx`'s rule exactly: a brand that has not started does not get a heading
 * over an empty rectangle. This is that rule's one required test, for the one prop that decides it.
 */
describe("DecksBand", () => {
  it("renders nothing for a brand with no decks", () => {
    const { container } = render(<DecksBand brandId="b1" decks={[]} anchor="decks" />);
    // Plain DOM, not a jest-dom matcher — `test-setup.ts` does not wire jest-dom in (see
    // `brand-profile.test.tsx`'s note), so `container.firstChild` is the assertion available here.
    expect(container.firstChild).toBeNull();
  });
});
