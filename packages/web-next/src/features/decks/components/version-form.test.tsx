import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDeckMutations } from "../hooks";
import { VersionForm } from "./version-form";

vi.mock("../hooks", () => ({ useDeckMutations: vi.fn() }));
vi.mock("@/lib/blob", () => ({ uploadBlob: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { uploadBlob } = await import("@/lib/blob");
const { toast } = await import("sonner");

const mockedUseDeckMutations = vi.mocked(useDeckMutations);
const mockedUpload = vi.mocked(uploadBlob);
const addVersion = vi.fn();

function deckWithCurrent(label: string) {
  return { current: { label } } as Awaited<ReturnType<typeof addVersion>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  addVersion.mockResolvedValue(deckWithCurrent("v2"));
  mockedUpload.mockResolvedValue({ key: "blobs/uploaded.pdf" });
  mockedUseDeckMutations.mockReturnValue({ create: vi.fn(), addVersion });
});

function renderForm() {
  return render(
    <VersionForm
      brandId="b1"
      deckId="d1"
      deckName="Brand deck"
      open
      onOpenChange={vi.fn()}
    />,
  );
}

function fillCommonFields() {
  fireEvent.change(screen.getByLabelText(/Version label/), { target: { value: "v2" } });
  fireEvent.change(screen.getByLabelText(/Version date/), { target: { value: "2026-02-01" } });
  fireEvent.change(screen.getByLabelText(/Author/), { target: { value: "Studio Mission" } });
}

function attachPdf(labelPattern: RegExp) {
  const file = new File(["%PDF-1.7"], "deck.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(labelPattern), { target: { files: [file] } });
}

describe("VersionForm", () => {
  it("asks for no link on the PDF arm — the file is the version", () => {
    renderForm();
    expect(screen.queryByLabelText(/Canva link/)).toBe(null);
    expect(screen.getByLabelText(/PDF file/)).not.toBe(null);
  });

  it("asks for both the link and the export on the Canva arm", () => {
    // The asymmetry is the feature: a Canva version is a live design *and* a
    // snapshot of what the team saw. Decision 3 made the snapshot required, and
    // `deck_versions_source_shape` enforces it two layers down.
    renderForm();
    fireEvent.change(screen.getByLabelText(/Source/), { target: { value: "canva" } });
    expect(screen.getByLabelText(/Canva link/)).not.toBe(null);
    expect(screen.getByLabelText(/PDF export of this design/)).not.toBe(null);
  });

  it("says why the snapshot is not optional", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Source/), { target: { value: "canva" } });
    expect(
      screen.getByText(/preserves what it looked like today/i),
    ).not.toBe(null);
  });

  it("refuses to submit a Canva version with no export attached", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Source/), { target: { value: "canva" } });
    fillCommonFields();
    fireEvent.change(screen.getByLabelText(/Canva link/), {
      target: { value: "https://www.canva.com/design/abc" },
    });

    fireEvent.submit(screen.getByRole("button", { name: "Add version" }).closest("form")!);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // Nothing may be written: a row without its snapshot is the state the CHECK
    // exists to make impossible, and the client should not be sending it.
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(addVersion).not.toHaveBeenCalled();
  });

  it("uploads before it writes the row", async () => {
    // **The order is the interesting part.** The reverse leaves a row pointing at
    // bytes that never arrived, and the CHECK cannot catch that — it constrains
    // the column, not the object store.
    const calls: string[] = [];
    mockedUpload.mockImplementation(async () => {
      calls.push("upload");
      return { key: "blobs/uploaded.pdf" };
    });
    addVersion.mockImplementation(async () => {
      calls.push("insert");
      return deckWithCurrent("v2");
    });

    renderForm();
    fillCommonFields();
    attachPdf(/PDF file/);
    fireEvent.submit(screen.getByRole("button", { name: "Add version" }).closest("form")!);

    await waitFor(() => expect(addVersion).toHaveBeenCalled());
    expect(calls).toEqual(["upload", "insert"]);
  });

  it("writes no row when the upload fails", async () => {
    mockedUpload.mockRejectedValue(new Error("Storage upload failed (500)"));

    renderForm();
    fillCommonFields();
    attachPdf(/PDF file/);
    fireEvent.submit(screen.getByRole("button", { name: "Add version" }).closest("form")!);

    await waitFor(() => expect(mockedUpload).toHaveBeenCalled());
    // A failed upload must leave no row at all. The opposite failure — an
    // unreferenced blob — is the strictly safer one, and the brand cascade
    // already sweeps it.
    expect(addVersion).not.toHaveBeenCalled();
  });

  it("sends the key the upload returned, on the arm the reader chose", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Source/), { target: { value: "canva" } });
    fillCommonFields();
    fireEvent.change(screen.getByLabelText(/Canva link/), {
      target: { value: "https://www.canva.com/design/abc" },
    });
    attachPdf(/PDF export of this design/);
    fireEvent.submit(screen.getByRole("button", { name: "Add version" }).closest("form")!);

    await waitFor(() => expect(addVersion).toHaveBeenCalled());
    expect(addVersion).toHaveBeenCalledWith("d1", {
      source: "canva",
      label: "v2",
      versionDate: "2026-02-01",
      author: "Studio Mission",
      canvaUrl: "https://www.canva.com/design/abc",
      pdfBlobKey: "blobs/uploaded.pdf",
    });
  });

  it("does not claim a backdated version is current", async () => {
    // The server answers with the whole stack precisely so this can be right
    // either way: a version dated before the current one does not supersede it.
    addVersion.mockResolvedValue(deckWithCurrent("v9"));

    renderForm();
    fillCommonFields();
    attachPdf(/PDF file/);
    fireEvent.submit(screen.getByRole("button", { name: "Add version" }).closest("form")!);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(vi.mocked(toast.success).mock.calls[0]![0]).toContain("behind the current version");
  });

  it("says so when the new version does lead", async () => {
    renderForm();
    fillCommonFields();
    attachPdf(/PDF file/);
    fireEvent.submit(screen.getByRole("button", { name: "Add version" }).closest("form")!);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(vi.mocked(toast.success).mock.calls[0]![0]).toContain("now the current version");
  });
});
