import type { DeckVersion } from "@brandfactory/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDeckMutations, useDecks } from "../hooks";
import type { DeckWithVersions } from "../api";
import { DecksView } from "./decks-view";

/**
 * Four claims, each specific to what this screen is for.
 *
 * - The current version — the one `routes/decks.ts` already picked with `currentVersion` — shows
 *   without a click. A screen that made a reader open a history panel to see the deck's own answer
 *   would have inverted the whole point of "current".
 * - An older version is not gone — it is one click away, behind a history toggle that names how
 *   many there are.
 * - A deck that exists with no versions yet is a real, quiet state — not a crash and not a blank
 *   screen. `currentVersion([])` already answers `null`; this is the render side of that contract.
 * - The `source` discriminator earns a different affordance per version: a Canva version opens
 *   (a plain external link, live design), a PDF version downloads (its only copy). If the screen
 *   could not tell the two apart, the column 2A added would have bought nothing.
 *
 * `vi.mock("../hooks")` on `ResourcesView`'s rule: this package's tests are not the screens, so
 * what is worth a render test is behaviour a browser pass would not catch, not the fetch itself.
 * `vi.mock("@/lib/blob")` for the same reason `blob.test.ts` exists separately — the download path
 * is exercised there in full; here only the wiring (which function fires, with what) is asserted.
 */

vi.mock("../hooks", () => ({
  useDecks: vi.fn(),
  useDeckMutations: vi.fn(),
}));

vi.mock("@/lib/blob", () => ({
  fetchReadUrl: vi.fn(),
  downloadBlobUrl: vi.fn(),
}));

const mockedUseDecks = vi.mocked(useDecks);
const mockedUseDeckMutations = vi.mocked(useDeckMutations);

beforeEach(() => {
  mockedUseDeckMutations.mockReturnValue({ create: vi.fn() });
});

// Ids are zod-branded (`$brand<"DeckId">` etc.), which a plain string never satisfies — so the
// fixture casts through `unknown`, the same move `resources-view.test.tsx` makes on its own.
function pdfVersion(overrides: {
  id?: string;
  label: string;
  versionDate?: string;
  author?: string;
  pdfBlobKey?: string;
}): DeckVersion {
  return {
    id: overrides.id ?? "v1",
    deckId: "d1",
    label: overrides.label,
    versionDate: overrides.versionDate ?? "2026-01-01",
    author: overrides.author ?? "In-house design",
    createdAt: "2026-01-01T09:00:00.000Z",
    source: "pdf",
    pdfBlobKey: overrides.pdfBlobKey ?? "decks/d1/v1.pdf",
    canvaUrl: null,
  } as unknown as DeckVersion;
}

function canvaVersion(overrides: {
  id?: string;
  label: string;
  versionDate?: string;
  author?: string;
  canvaUrl?: string;
  pdfBlobKey?: string;
}): DeckVersion {
  return {
    id: overrides.id ?? "v1",
    deckId: "d1",
    label: overrides.label,
    versionDate: overrides.versionDate ?? "2026-01-01",
    author: overrides.author ?? "Agency",
    createdAt: "2026-01-01T09:00:00.000Z",
    source: "canva",
    canvaUrl: overrides.canvaUrl ?? "https://canva.com/design/abc/edit",
    pdfBlobKey: overrides.pdfBlobKey ?? "decks/d1/v1.pdf",
  } as unknown as DeckVersion;
}

function deck(overrides: {
  id?: string;
  name: string;
  versions: DeckVersion[];
  current: DeckVersion | null;
}): DeckWithVersions {
  return {
    id: overrides.id ?? "d1",
    brandId: "b1",
    name: overrides.name,
    versions: overrides.versions,
    current: overrides.current,
  } as unknown as DeckWithVersions;
}

describe("DecksView", () => {
  it("shows the newest version by default", () => {
    const older = pdfVersion({ id: "v1", label: "First draft", versionDate: "2026-01-01" });
    const newest = pdfVersion({ id: "v2", label: "Client final", versionDate: "2026-02-01" });
    mockedUseDecks.mockReturnValue({
      decks: [deck({ name: "Investor pitch", versions: [older, newest], current: newest })],
      isLoading: false,
      error: undefined,
    });

    render(<DecksView brandId="b1" />);

    // The current version's label is on screen with no interaction — this is the whole claim.
    screen.getByText("Client final");
  });

  it("keeps older versions reachable rather than deleted", () => {
    const older = pdfVersion({ id: "v1", label: "First draft", versionDate: "2026-01-01" });
    const newest = pdfVersion({ id: "v2", label: "Client final", versionDate: "2026-02-01" });
    mockedUseDecks.mockReturnValue({
      decks: [deck({ name: "Investor pitch", versions: [older, newest], current: newest })],
      isLoading: false,
      error: undefined,
    });

    render(<DecksView brandId="b1" />);

    // Not deleted, but not dumped on screen either — it is behind a named toggle until asked for.
    expect(screen.queryByText("First draft")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /1 earlier version/ }));

    screen.getByText("First draft");
  });

  it("renders a deck with no versions as an empty stack, not an error", () => {
    mockedUseDecks.mockReturnValue({
      decks: [deck({ name: "Untitled deck", versions: [], current: null })],
      isLoading: false,
      error: undefined,
    });

    render(<DecksView brandId="b1" />);

    screen.getByText(/no versions yet/i);
    // The deck itself still rendered — this is a deck with nothing in it, not a failed deck list.
    screen.getByText("Untitled deck");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("labels a Canva version as opening in Canva, and a PDF version as downloading", () => {
    const canva = canvaVersion({
      label: "Client final",
      canvaUrl: "https://canva.com/design/xyz/edit",
    });
    const pdf = pdfVersion({ label: "Print-ready" });
    mockedUseDecks.mockReturnValue({
      decks: [
        deck({ id: "d1", name: "Pitch deck", versions: [canva], current: canva }),
        deck({ id: "d2", name: "Sell sheet", versions: [pdf], current: pdf }),
      ],
      isLoading: false,
      error: undefined,
    });

    render(<DecksView brandId="b1" />);

    // Canva: a plain external link to the live design, not a download.
    const link = screen.getByRole("link", { name: /Open in Canva/ });
    expect(link.getAttribute("href")).toBe("https://canva.com/design/xyz/edit");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("button", { name: /Open in Canva/ })).toBeNull();

    // PDF: a button that downloads, not a link out.
    screen.getByRole("button", { name: /Download PDF/ });
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });

  it("mints a read URL and downloads the bytes when a PDF version's button is pressed", async () => {
    const { fetchReadUrl, downloadBlobUrl } = await import("@/lib/blob");
    vi.mocked(fetchReadUrl).mockResolvedValue("https://storage.example/signed");
    vi.mocked(downloadBlobUrl).mockResolvedValue(undefined);

    const pdf = pdfVersion({ label: "Print-ready", pdfBlobKey: "decks/d1/print-ready.pdf" });
    mockedUseDecks.mockReturnValue({
      decks: [deck({ name: "Sell sheet", versions: [pdf], current: pdf })],
      isLoading: false,
      error: undefined,
    });

    render(<DecksView brandId="b1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    });

    expect(fetchReadUrl).toHaveBeenCalledWith("decks/d1/print-ready.pdf");
    expect(downloadBlobUrl).toHaveBeenCalledWith(
      "https://storage.example/signed",
      "Sell sheet — Print-ready.pdf",
    );
  });

  it("renders an empty state rather than a heading over nothing", () => {
    mockedUseDecks.mockReturnValue({ decks: [], isLoading: false, error: undefined });

    render(<DecksView brandId="b1" />);

    screen.getByText(/no decks yet/i);
  });
});
