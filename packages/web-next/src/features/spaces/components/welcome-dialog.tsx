"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Calculator,
  Check,
  FileUp,
  Images,
  Loader2,
  Map,
  PencilRuler,
  Ruler,
  ScanSearch,
  Scale,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button, Pill } from "@/features/spaces/components/ui";
import { spacesService } from "@/features/spaces/api";
import { useSpaceMutations } from "@/features/spaces/hooks";
import { createDemoScheme } from "@/features/spaces/demo";
import type { DigitiseStepId } from "@/features/spaces/digitise";

/**
 * Welcome + ingest.
 *
 * Two modes, because this dialog does two jobs that used to be one when OpenSpace was a
 * single-page app that opened on a demo scheme:
 *
 *   - `create` — from `/spaces`. Drop a drawing, watch the digitiser work, and **a real
 *     scheme is created** and opened. The upstream version loaded the traced unit into an
 *     in-memory store and lost it on reload; here the result is posted to `POST /spaces`
 *     like any other record.
 *   - `help` — from inside the workspace. The same explanation with no ingest, because
 *     the scheme you are looking at already exists and dropping a drawing here would be
 *     ambiguous: replace this plan, or start another one?
 *
 * The digitiser now runs on the backend (`POST /spaces/digitise`); it was a Next API
 * route holding an `ANTHROPIC_API_KEY`, and this frontend holds no secrets. The streamed
 * step events are unchanged, which is why the progress list below did not have to move.
 */

/** The four views, in sidebar order — the dialog teaches the nav. */
const CAPABILITIES = [
  {
    icon: Map,
    label: "Plan",
    detail: "Block out zones, drop in furniture, drag it around. True to scale.",
  },
  {
    icon: Box,
    label: "Walkthrough",
    detail: "Stand inside the same layout at eye level and judge how it feels.",
  },
  {
    icon: Images,
    label: "Album",
    detail: "Pin references and shopping links for the things that go in it.",
  },
  {
    icon: Calculator,
    label: "Cost",
    detail: "A running estimate of what the plan adds up to, as it changes.",
  },
] as const;

const STEPS: { id: DigitiseStepId; icon: typeof ScanSearch; label: string }[] = [
  { id: "read", icon: ScanSearch, label: "Reading the drawing" },
  { id: "scale", icon: Ruler, label: "Finding the scale" },
  { id: "trace", icon: PencilRuler, label: "Tracing the boundary" },
  { id: "check", icon: Scale, label: "Checking itself" },
];

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

type StepState = { status: "todo" | "active" | "done"; detail?: string };
type StepMap = Record<DigitiseStepId, StepState>;

const initialSteps = (): StepMap => ({
  read: { status: "todo" },
  scale: { status: "todo" },
  trace: { status: "todo" },
  check: { status: "todo" },
});

export function WelcomeDialog({
  onClose,
  mode = "create",
  outletId = null,
  onCreated,
}: {
  onClose: () => void;
  mode?: "create" | "help";
  outletId?: string | null;
  onCreated?: (schemeId: string) => void;
}) {
  const [phase, setPhase] = useState<"intro" | "digitising">("intro");
  const [steps, setSteps] = useState<StepMap>(initialSteps);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { create } = useSpaceMutations();

  const close = useCallback(() => {
    abortRef.current?.abort();
    onClose();
  }, [onClose]);

  /** Start from the demo unit — a real, saved scheme, not an in-memory placeholder. */
  const startFromDemo = useCallback(async () => {
    try {
      const created = await create(createDemoScheme(), outletId);
      onCreated?.(created.id);
    } catch (err) {
      setPhase("digitising");
      setError(err instanceof Error ? err.message : "Could not create the scheme.");
    }
  }, [create, onCreated, outletId]);

  const start = useCallback(
    async (file: File) => {
      if (!ACCEPTED.includes(file.type)) {
        setPhase("digitising");
        setSteps(initialSteps());
        setError(
          `"${file.name}" isn't a PDF or image — upload the drawing as PDF, PNG, JPG or WebP.`,
        );
        return;
      }
      setPhase("digitising");
      setSteps(initialSteps());
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await spacesService.digitise(
          file,
          (event) => {
            if (event.type === "step") {
              setSteps((s) => ({
                ...s,
                [event.id]: { status: event.status, detail: event.detail },
              }));
            } else if (event.type === "error") {
              throw new Error(event.message);
            } else if (event.type === "result") {
              // Saved before the dialog closes. The digitiser writes nothing itself —
              // its answer is a proposal — so this is the ordinary create, and if it
              // fails the user is told rather than dropped into an editor holding a
              // scheme that does not exist.
              void create(event.scheme, outletId)
                .then((created) => onCreated?.(created.id))
                .catch((err: unknown) =>
                  setError(
                    err instanceof Error
                      ? `The drawing was digitised but could not be saved: ${err.message}`
                      : "The drawing was digitised but could not be saved.",
                  ),
                );
            }
          },
          controller.signal,
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "The digitiser failed unexpectedly.");
      }
    },
    [create, onCreated, outletId],
  );

  // Move focus into the dialog on open; the workspace behind is inert.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Esc dismisses — you land in the demo scheme either way.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Abort an in-flight digitise if the dialog unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = phase === "digitising" && !error && steps.check.status !== "done";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-4 animate-scrim-in max-md:items-start max-md:p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        className="my-auto w-full max-w-[680px] rounded-2xl border border-border bg-surface shadow-e3 outline-none animate-dialog-in"
      >
        {/* ── Identity row ────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 border-b border-border-subtle px-6 py-4 max-md:px-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-accent">
            <div className="size-3.5 rounded-[3px] border-2 border-ink-inverse/90" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">OpenSpace</div>
            <div className="text-xs text-ink-tertiary">
              Mission Systems — hackathon build
            </div>
          </div>
          <Pill>Beta</Pill>
          <button
            onClick={close}
            aria-label="Close"
            className="-mr-1 flex size-8 items-center justify-center rounded-lg text-ink-tertiary transition-colors duration-120 hover:bg-surface-hover hover:text-ink"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-6 py-6 max-md:px-5">
          <h2
            id="welcome-title"
            className="text-[22px] font-medium leading-tight tracking-[-0.015em] text-ink"
          >
            Turn the drawings of a space into a space
          </h2>
          <p className="mt-2 text-[15px] text-ink-secondary">
            Bring in the floorplan you were handed. Get a true-to-scale unit you can
            shape, stand inside, furnish and cost — in one place.
          </p>

          {/* Height pinned on desktop so swapping to the agent loop doesn't
              resize the dialog under the cursor. */}
          <div className="md:min-h-[336px]">
          {phase === "intro" ? (
            <>
              {/* ── What the four views do ─────────────────────────────── */}
              <div className="mt-5 grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
                {CAPABILITIES.map(({ icon: Icon, label, detail }) => (
                  <div
                    key={label}
                    className="rounded-lg bg-surface-sunken px-3.5 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 shrink-0 text-ink-secondary" strokeWidth={1.75} />
                      <span className="text-[13px] font-medium text-ink">{label}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug text-ink-tertiary">
                      {detail}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-[13px] text-ink-secondary">
                They are one set of decisions, not four tools: the box you place on the
                plan is the reference you pinned and the line in the cost.
              </p>

              {/* ── Ingest. Absent in `help` mode: the scheme on screen already
                     exists, and dropping a drawing here would be ambiguous between
                     replacing this plan and starting another one. ──────────── */}
              {mode === "create" && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void start(file);
                }}
                className={`mt-5 flex items-center gap-4 rounded-lg border border-dashed px-4 py-4 transition-colors duration-120 max-md:flex-col max-md:text-center ${
                  dragOver ? "border-brand bg-surface-selected" : "border-border-strong bg-surface-sunken"
                }`}
              >
                <FileUp className="size-6 shrink-0 text-ink-tertiary" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">
                    Drop your drawings here
                  </div>
                  <div className="mt-0.5 text-[13px] text-ink-tertiary">
                    Landlord PDF, lease drawing or survey — PNG, JPG or PDF
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => fileInput.current?.click()}
                >
                  Choose a file
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void start(file);
                  }}
                />
              </div>
              )}
            </>
          ) : (
            <div className="mt-5" aria-busy={busy} role="status">
              <div className="mb-4 text-sm font-medium text-ink">
                Digitising the drawing
              </div>
              <ol className="flex flex-col gap-4">
                {STEPS.map(({ id, icon: Icon, label }) => {
                  const step = steps[id];
                  return (
                    <li key={id} className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {step.status === "done" ? (
                          <Check className="size-4 text-success" strokeWidth={2.5} />
                        ) : step.status === "active" && !error ? (
                          <Loader2 className="size-4 animate-spin text-brand" />
                        ) : (
                          <Icon className="size-4 text-ink-disabled" strokeWidth={1.5} />
                        )}
                      </div>
                      <div className={step.status === "todo" ? "opacity-40" : ""}>
                        <div className="text-sm text-ink">{label}</div>
                        {step.detail && (
                          <div className="mt-0.5 text-[13px] text-ink-tertiary">
                            {step.detail}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              {error && (
                <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-surface-sunken px-3.5 py-3">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink">
                      The digitiser couldn&apos;t finish
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-ink-tertiary">{error}</p>
                    <div className="mt-2.5 flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setPhase("intro")}>
                        Try another file
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void startFromDemo()}>
                        Start from the demo unit
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-6 py-3.5 max-md:px-5">
          <p className="text-xs text-ink-tertiary">
            {mode === "create"
              ? "The digitiser reads your drawing with a vision model. Every dimension it emits carries how it was obtained."
              : "Every dimension in this scheme carries how it was obtained — measured, derived, inferred or placed."}
          </p>
          {mode === "create" && phase === "intro" && (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => void startFromDemo()}
            >
              Start from the demo unit
            </Button>
          )}
          {mode === "help" && (
            <Button variant="secondary" size="sm" className="shrink-0" onClick={close}>
              Back to the plan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
