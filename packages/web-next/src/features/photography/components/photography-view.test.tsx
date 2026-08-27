import type { BrandAsset, PhotoCategory } from "@brandfactory/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePhotography, usePhotographyMutations } from "../hooks";
import { PhotographyView } from "./photography-view";

vi.mock("../hooks", () => ({ usePhotography: vi.fn(), usePhotographyMutations: vi.fn() }));
vi.mock("@/lib/blob", () => ({ useSignedReadUrl: () => ({ data: undefined }), uploadBlob: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./category-manager", () => ({ CategoryManager: () => null }));

const { toast } = await import("sonner");
const mockedUsePhotography = vi.mocked(usePhotography);
const mockedUseMutations = vi.mocked(usePhotographyMutations);
const setPinned = vi.fn();
const addPhoto = vi.fn();
const reorderPhotos = vi.fn();

function photo(overrides: Partial<Record<keyof BrandAsset, unknown>> = {}): BrandAsset {
  return {
    id: "a1",
    brandId: "b1",
    kind: "image",
    source: "link",
    url: "https://cdn.example.com/a.jpg",
    role: null,
    status: "active",
    library: "photography",
    label: "A photo",
    position: 100,
    isPinned: false,
    pinnedAt: null,
    categoryId: null,
    deletedAt: null,
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    ...overrides,
  } as BrandAsset;
}

function category(id: string, name: string): PhotoCategory {
  return {
    id,
    brandId: "b1",
    name,
    position: 100,
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
  } as PhotoCategory;
}

function setup(photos: BrandAsset[], categories: PhotoCategory[] = []) {
  mockedUsePhotography.mockReturnValue({ photos, categories, isLoading: false, error: null });
  render(<PhotographyView brandId="b1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseMutations.mockReturnValue({
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    setCategory: vi.fn(),
    addPhoto,
    reorderPhotos,
    setPinned,
  });
});

describe("PhotographyView", () => {
  it("offers Uncategorised even when the brand has no categories at all", () => {
    // **The bucket every photo that predates 3B lives in.** A view that only
    // showed it once somebody made a category would hide the whole existing
    // library on the day this shipped.
    setup([photo({ id: "a" }), photo({ id: "b" })]);
    expect(screen.getByRole("button", { name: /Uncategorised/ })).not.toBe(null);
  });

  it("does not offer Uncategorised when nothing is in it", () => {
    setup([photo({ id: "a", categoryId: "c1" })], [category("c1", "Food")]);
    expect(screen.queryByRole("button", { name: /Uncategorised/ })).toBe(null);
  });

  it("filters to one subject, and counts each chip", () => {
    setup(
      [
        photo({ id: "a", label: "Dining room", categoryId: "c1" }),
        photo({ id: "b", label: "Pasta", categoryId: "c2" }),
        photo({ id: "c", label: "Loose", categoryId: null }),
      ],
      [category("c1", "Interior"), category("c2", "Food")],
    );

    // The counts are totals, not "N so far" — the read has no cursor, which is
    // what makes stating one honest.
    // The label is explicit rather than computed: "All" beside a count span
    // announces as "All3", and a bare digit does not say what it counts.
    expect(screen.getByRole("button", { name: "All, 3 photos" })).not.toBe(null);

    fireEvent.click(screen.getByRole("button", { name: /Interior/ }));
    expect(screen.getByText("Dining room")).not.toBe(null);
    expect(screen.queryByText("Pasta")).toBe(null);
    expect(screen.queryByText("Loose")).toBe(null);
  });

  it("says the photos still exist when a subject is empty", () => {
    // Not "no photos" — they are filed elsewhere, and a reader who is told
    // nothing reads an empty grid as a missing library.
    setup([photo({ id: "a", categoryId: null })], [category("c1", "Food")]);
    fireEvent.click(screen.getByRole("button", { name: /Food/ }));
    expect(screen.getByText("Nothing filed under this subject")).not.toBe(null);
    expect(screen.getByText(/still there/)).not.toBe(null);
  });

  it("names the photo in the pin control, so a grid of twenty is navigable", () => {
    setup([photo({ label: "Dining room" })]);
    expect(screen.getByRole("button", { name: "Pin Dining room" })).not.toBe(null);
  });

  it("reads the pin state onto the control, and toggles the other way", () => {
    setup([photo({ label: "Dining room", isPinned: true })]);
    const button = screen.getByRole("button", { name: "Unpin Dining room" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(setPinned).toHaveBeenCalledWith("a1", false);
  });

  it("renders the order the hook hands it, unsorted", () => {
    // `usePhotography` returns `photographyInReadingOrder` — pinned first, then
    // position. The view must not re-sort: a second ordering here is a second
    // place for the rule to live, and the two would disagree.
    setup([
      photo({ id: "a", label: "Pinned", isPinned: true }),
      photo({ id: "b", label: "Plain" }),
    ]);
    const labels = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(labels[0]).toContain("Pinned");
  });

  it("offers Uncategorised as a choice on each photo, not a blank", () => {
    setup([photo({ label: "Dining room" })], [category("c1", "Food")]);
    const select = screen.getByLabelText("Subject for Dining room") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Uncategorised", "Food"]);
  });

  it("shows an empty state for a brand with no photographs", () => {
    setup([]);
    expect(screen.getByText("No photographs yet")).not.toBe(null);
  });
});

describe("adding photographs", () => {
  it("offers a way in, even on an empty shelf", () => {
    // **The gap this test exists for.** The screen shipped with a subject manager, a
    // filter and a pin — and no way to put a photograph on the shelf at all. The old
    // Vite app has an uploader, and "the library already exists" was read as "there is
    // already a way to add to it". There was not, in this app.
    setup([]);
    expect(screen.getByRole("button", { name: /Add photos/ })).not.toBe(null);
  });

  it("uploads each chosen file", async () => {
    setup([]);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const a = new File(["a"], "dining-room.jpg", { type: "image/jpeg" });
    const b = new File(["b"], "pasta.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [a, b] } });

    await waitFor(() => expect(addPhoto).toHaveBeenCalledTimes(2));
    expect(addPhoto).toHaveBeenNthCalledWith(1, a);
    expect(addPhoto).toHaveBeenNthCalledWith(2, b);
  });

  it("keeps going when one file fails, and names the one that did", async () => {
    // A reader who picked eight files needs to know *which* failed — and that the other
    // seven landed.
    addPhoto.mockRejectedValueOnce(new Error("too large")).mockResolvedValueOnce({});
    setup([]);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File(["a"], "huge.jpg", { type: "image/jpeg" }),
          new File(["b"], "fine.jpg", { type: "image/jpeg" }),
        ],
      },
    });

    await waitFor(() => expect(addPhoto).toHaveBeenCalledTimes(2));
    expect(vi.mocked(toast.error).mock.calls[0]![0]).toContain("huge.jpg");
  });
});

describe("manual order", () => {
  it("says why dragging is off inside a subject, rather than leaving the handle dead", () => {
    // The order written is the whole shelf's. A drag inside a filtered view would
    // renumber three photos against a list of forty, moving rows nobody can see.
    setup(
      [
        photo({ id: "a", label: "One", categoryId: "c1" }),
        photo({ id: "b", label: "Two", categoryId: "c1" }),
      ],
      [category("c1", "Interior")],
    );
    fireEvent.click(screen.getByRole("button", { name: /Interior/ }));
    expect(screen.getByText(/order belongs to the whole shelf/)).not.toBe(null);
  });

  it("says nothing on All, where dragging works", () => {
    setup([photo({ id: "a" }), photo({ id: "b" })]);
    expect(screen.queryByText(/order belongs to the whole shelf/)).toBe(null);
  });
});
