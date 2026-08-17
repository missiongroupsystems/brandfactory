"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChevronDownIcon, FilePlus2Icon, UploadIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The "New X" primary action, split into two doors (F3 of the 2026-08-13 worklist, **UI only**).
 *
 * Every document-bearing list screen (contracts, licences, servicing & repairs, vendors,
 * contacts) had one accent button that opened the manual form. This keeps that button as the
 * one primary per view (§4 budget) but turns it into a dropdown offering two ways in:
 *
 *   - **Manual add** — the existing sheet/form, unchanged. `onManualAdd` is the old onClick.
 *   - **Upload** — a drag-and-drop "drop a PDF" popup that, deliberately, **does nothing on
 *     drop**. Wiring an upload to a route, storage and an extraction proposal is a separate
 *     conversation; this exists to get Tuesday's feedback on the *shape* of that flow. The
 *     drop zone reuses the dashed-zone idiom from `DocumentsCard`.
 *
 * Shared in `components/layout` rather than copied per feature because five screens use it and
 * it carries no feature-specific logic — the AGENTS.md bar for promotion out of a feature.
 */
export function AddMenuButton({
  label,
  noun,
  onManualAdd,
  className,
}: {
  /** The primary action label, e.g. "New contract" — the exact text the old button showed. */
  label: string;
  /** The lowercase thing being added, for the upload popup's copy, e.g. "contract", "licence". */
  noun: string;
  /** The existing manual-add handler — opens the form/sheet the button used to open. */
  onManualAdd: () => void;
  /** Passthrough for the width utilities some pages set (`w-full sm:w-auto`). */
  className?: string;
}) {
  const [uploadOpen, setUploadOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        {/* `render={<Button/>}` is the Base UI composition — not `asChild` — and the default
            (accent) variant, so this stays the single primary action it replaces. The trailing
            chevron signals the menu; `aria-expanded` on the Base UI Button rotates nothing here
            but drives the `secondary`/`ghost` open-state styling elsewhere. */}
        <DropdownMenuTrigger render={<Button className={className} />}>
          {label}
          <ChevronDownIcon data-icon="inline-end" className="opacity-80" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onClick={onManualAdd} className="gap-2">
            <FilePlus2Icon />
            <span className="flex flex-col">
              <span className="font-medium text-ink">Manual add</span>
              <span className="text-helper text-ink-tertiary">Fill in the form yourself</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setUploadOpen(true)} className="gap-2">
            <UploadIcon />
            <span className="flex flex-col">
              <span className="font-medium text-ink">Upload</span>
              <span className="text-helper text-ink-tertiary">Drop a PDF and read it in</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UploadDropDialog noun={noun} open={uploadOpen} onOpenChange={setUploadOpen} />
    </>
  );
}

/**
 * The "drop a PDF" popup (F3, **UI only**). A proper Base UI Dialog (light-dismissible), not the
 * AlertDialog — this is a picker, not a destructive confirmation, so it should not announce as
 * `role="alertdialog"` or refuse an outside click.
 *
 * **It does nothing on drop.** To make the drop UI legible without pretending to work, it
 * captures the dropped file's *name* and shows it under a persistent note that upload is not
 * connected. No bytes are read, nothing is sent, nothing is routed.
 */
function UploadDropDialog({
  noun,
  open,
  onOpenChange,
}: {
  noun: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [dropped, setDropped] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean) {
    // Reset on close so reopening starts clean, not on the last drop's filename.
    if (!next) {
      setDropped(null);
      setIsDragging(false);
    }
    onOpenChange(next);
  }

  // Capture the name only — F3 is design-only. The bytes are deliberately never touched.
  function noteFile(files: FileList | File[] | null) {
    const first = files && files.length > 0 ? files[0] : null;
    if (first) setDropped(first.name);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-popover p-6 text-sm text-popover-foreground shadow-e3 transition duration-150 data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-h3 text-ink">
              Upload a {noun} PDF
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-helper text-ink-secondary">
              Drop the signed document here and its details would be read in for you to check —
              the same flow the contract page already uses for documents.
            </DialogPrimitive.Description>
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-label={`Drop a ${noun} PDF, or choose a file`}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInput.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              // Does nothing but note the name — F3 wires no upload.
              noteFile(event.dataTransfer.files);
            }}
            className={`flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-helper transition-colors ${
              isDragging
                ? "border-border-strong bg-surface-selected text-ink"
                : "border-border text-ink-secondary hover:bg-surface-hover"
            }`}
          >
            <UploadIcon aria-hidden className="size-6 text-ink-tertiary" />
            <span>
              Drop a PDF here, or <span className="font-medium text-ink">choose a file</span>
            </span>
            {dropped ? (
              <span className="text-ink-tertiary">Selected: {dropped} — not uploaded</span>
            ) : null}
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="sr-only"
            aria-label={`Choose a ${noun} PDF`}
            onChange={(event) => noteFile(event.target.files)}
          />

          {/* The honesty note — persistent, because on drop nothing happens by design. */}
          <p className="rounded-lg bg-info-tint p-3 text-helper text-info">
            Upload isn&apos;t connected yet — this is a design preview. Nothing is sent, stored or
            read; wiring it to storage and extraction is a separate change.
          </p>

          <div className="flex justify-end">
            <DialogPrimitive.Close render={<Button variant="secondary" />}>
              Close
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
