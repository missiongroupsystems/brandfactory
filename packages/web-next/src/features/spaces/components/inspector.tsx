"use client";

import { Copy, ExternalLink, RotateCw, Scissors, Trash2, Unlink } from "lucide-react";
import { Button, Field, Pill, inputClass } from "@/features/spaces/components/ui";
import { useSchemeStore } from "@/features/spaces/store";
import { fmtLength, fmtMoney } from "@/features/spaces/format";
import type { OpeningKind, Provenance } from "@/features/spaces/types";
import { OPENING_KIND_LABELS } from "@/features/spaces/plan-geometry";

const SOURCE_TONE: Record<Provenance, "success" | "neutral" | "warning" | "info"> = {
  measured: "success",
  derived: "info",
  inferred: "warning",
  placed: "neutral",
};

const SOURCE_LABEL: Record<Provenance, string> = {
  measured: "Dims measured",
  derived: "Dims derived",
  inferred: "Dims inferred",
  placed: "Dims as placed",
};

function UnitSummary() {
  const unit = useSchemeStore((s) => s.scheme.unit);
  return (
    <div className="mt-5 rounded-lg bg-surface-sunken p-3 text-[13px] text-ink-secondary">
      <div className="font-medium text-ink">{unit.name}</div>
      <dl data-numeric className="mt-2 space-y-1">
        <div className="flex justify-between">
          <dt className="text-ink-tertiary">Ceiling</dt>
          <dd>{(unit.ceilingHeight / 1000).toFixed(1)} m</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-tertiary">Corners</dt>
          <dd>{unit.boundary.length}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-tertiary">Columns</dt>
          <dd>{unit.columns.length}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-tertiary">Openings</dt>
          <dd>{unit.openings.length}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Numeric input that commits on blur/Enter rather than per keystroke —
 * boundary edits clamp and snap, which would fight live typing.
 */
function CommitField({
  label,
  value,
  onCommit,
  hint,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        key={value}
        type="number"
        data-numeric className={inputClass}
        defaultValue={value}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v !== value) onCommit(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </Field>
  );
}

const edgeLen = (boundary: { x: number; y: number }[], i: number) => {
  const a = boundary[i];
  const b = boundary[(i + 1) % boundary.length];
  return Math.hypot(b.x - a.x, b.y - a.y);
};

/** The Walls-mode side panel: corners, walls and openings as numbers. */
function WallsInspector() {
  const scheme = useSchemeStore((s) => s.scheme);
  const sel = useSchemeStore((s) => s.wallSelection);
  const selectWall = useSchemeStore((s) => s.selectWall);
  const updateBoundaryVertex = useSchemeStore((s) => s.updateBoundaryVertex);
  const insertBoundaryVertex = useSchemeStore((s) => s.insertBoundaryVertex);
  const removeBoundaryVertex = useSchemeStore((s) => s.removeBoundaryVertex);
  const setEdgeLength = useSchemeStore((s) => s.setEdgeLength);
  const updateOpening = useSchemeStore((s) => s.updateOpening);
  const removeOpening = useSchemeStore((s) => s.removeOpening);

  const { boundary, openings } = scheme.unit;
  const n = boundary.length;

  if (sel?.kind === "vertex" && boundary[sel.index]) {
    const v = boundary[sel.index];
    const prevEdge = (sel.index + n - 1) % n;
    return (
      <aside className="flex w-[264px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-4">
        <div>
          <div className="text-[13px] font-medium text-ink">
            Corner {sel.index + 1}
          </div>
          <p className="mt-1 text-[13px] text-ink-tertiary">
            Drag it on the plan, or set it here. All values are millimetres.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CommitField
            label="X (mm)"
            value={Math.round(v.x)}
            onCommit={(x) => updateBoundaryVertex(sel.index, x, v.y)}
          />
          <CommitField
            label="Y (mm)"
            value={Math.round(v.y)}
            onCommit={(y) => updateBoundaryVertex(sel.index, v.x, y)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <CommitField
            label="From previous corner (mm)"
            value={Math.round(edgeLen(boundary, prevEdge))}
            onCommit={(len) => setEdgeLength(prevEdge, len)}
          />
          <CommitField
            label="To next corner (mm)"
            value={Math.round(edgeLen(boundary, sel.index))}
            onCommit={(len) => setEdgeLength(sel.index, len)}
          />
          <p className="text-[13px] text-ink-tertiary">
            Setting a length slides the wall&apos;s far corner along its direction.
          </p>
        </div>
        <div className="mt-auto">
          <Button
            size="sm"
            variant="danger"
            className="w-full"
            disabled={n <= 3}
            onClick={() => removeBoundaryVertex(sel.index)}
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} />
            Remove corner
          </Button>
          {n <= 3 && (
            <p className="mt-1.5 text-[13px] text-ink-tertiary">
              A boundary needs at least three corners.
            </p>
          )}
        </div>
      </aside>
    );
  }

  if (sel?.kind === "edge" && boundary[sel.index]) {
    const len = edgeLen(boundary, sel.index);
    const onWall = openings.filter((o) => o.edge === sel.index).length;
    return (
      <aside className="flex w-[264px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-4">
        <div>
          <div className="text-[13px] font-medium text-ink">
            Wall {sel.index + 1}
          </div>
          <p className="mt-1 text-[13px] text-ink-tertiary">
            Drag the wall on the plan to push it in or out — its corners stay
            connected and any openings ride along.
          </p>
        </div>
        <CommitField
          label="Length (mm)"
          value={Math.round(len)}
          onCommit={(v) => setEdgeLength(sel.index, v)}
          hint="The far corner moves along the wall's direction."
        />
        <div className="rounded-lg bg-surface-sunken p-3 text-[13px] text-ink-secondary">
          <div className="flex justify-between">
            <span className="text-ink-tertiary">Openings on this wall</span>
            <span data-numeric>{onWall}</span>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            const a = boundary[sel.index];
            const b = boundary[(sel.index + 1) % n];
            const idx = insertBoundaryVertex(
              sel.index,
              Math.round((a.x + b.x) / 2),
              Math.round((a.y + b.y) / 2),
            );
            if (idx >= 0) selectWall({ kind: "vertex", index: idx });
          }}
        >
          <Scissors className="size-3.5" strokeWidth={1.75} />
          Split into two walls
        </Button>
      </aside>
    );
  }

  const op =
    sel?.kind === "opening" ? openings.find((o) => o.id === sel.id) : undefined;
  if (op) {
    const len = edgeLen(boundary, op.edge);
    return (
      <aside className="flex w-[264px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-4">
        <div>
          <div className="text-[13px] font-medium text-ink">
            {OPENING_KIND_LABELS[op.kind]}
          </div>
          <p className="mt-1 text-[13px] text-ink-tertiary">
            Drag it along the walls, or use the end handles to resize.
          </p>
        </div>
        <Field label="Kind">
          <select
            className={inputClass}
            value={op.kind}
            onChange={(e) =>
              updateOpening(op.id, { kind: e.target.value as OpeningKind })
            }
          >
            {(Object.keys(OPENING_KIND_LABELS) as OpeningKind[]).map((k) => (
              <option key={k} value={k}>
                {OPENING_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <CommitField
            label="Width (mm)"
            value={Math.round(op.width)}
            onCommit={(width) => updateOpening(op.id, { width })}
          />
          <CommitField
            label="From corner (mm)"
            value={Math.round(op.offset)}
            onCommit={(offset) => updateOpening(op.id, { offset })}
          />
        </div>
        <div className="rounded-lg bg-surface-sunken p-3 text-[13px] text-ink-secondary">
          <div className="flex justify-between">
            <span className="text-ink-tertiary">On wall</span>
            <span data-numeric>
              {op.edge + 1} · {fmtLength(len)}
            </span>
          </div>
        </div>
        <div className="mt-auto">
          <Button
            size="sm"
            variant="danger"
            className="w-full"
            onClick={() => removeOpening(op.id)}
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} />
            Delete opening
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[264px] shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
      <div className="text-[13px] font-medium text-ink">Editing the walls</div>
      <p className="mt-1.5 text-[13px] text-ink-tertiary">
        Drag a corner to reshape the unit, or drag a wall to push it in or out.
        Press the round + on a wall to add a corner. Use the Add toolbar to place
        doors, windows and entrances.
      </p>
      <UnitSummary />
    </aside>
  );
}

export function Inspector() {
  const scheme = useSchemeStore((s) => s.scheme);
  const planMode = useSchemeStore((s) => s.planMode);
  const selectedItemId = useSchemeStore((s) => s.selectedItemId);
  const updateItem = useSchemeStore((s) => s.updateItem);
  const removeItem = useSchemeStore((s) => s.removeItem);
  const duplicateItem = useSchemeStore((s) => s.duplicateItem);
  const rotateItem = useSchemeStore((s) => s.rotateItem);
  const attachReference = useSchemeStore((s) => s.attachReference);
  const detachReference = useSchemeStore((s) => s.detachReference);

  const item = scheme.items.find((i) => i.id === selectedItemId);

  if (planMode === "walls") return <WallsInspector />;

  if (!item) {
    return (
      <aside className="w-[264px] shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
        <div className="text-[13px] font-medium text-ink">Nothing selected</div>
        <p className="mt-1.5 text-[13px] text-ink-tertiary">
          Click an item on the plan to edit it. Drag to move, R to rotate, arrows to
          nudge, Delete to remove. Switch to Walls to correct the unit itself.
        </p>
        <UnitSummary />
      </aside>
    );
  }

  const ref = item.refId ? scheme.references.find((r) => r.id === item.refId) : undefined;

  const numField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    step = 50,
  ) => (
    <Field label={label}>
      <input
        type="number"
        data-numeric className={inputClass}
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );

  return (
    <aside className="flex w-[264px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-4">
      <div>
        <Field label="Name">
          <input
            className={inputClass}
            value={item.name}
            onChange={(e) => updateItem(item.id, { name: e.target.value })}
          />
        </Field>
        <div className="mt-2 flex items-center gap-1.5">
          <Pill tone={SOURCE_TONE[item.dimSource]}>{SOURCE_LABEL[item.dimSource]}</Pill>
          {item.seats > 0 && <Pill>{item.seats} covers</Pill>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {numField("Width (mm)", item.w, (w) => updateItem(item.id, { w, dimSource: "placed" }))}
        {numField("Depth (mm)", item.d, (d) => updateItem(item.id, { d, dimSource: "placed" }))}
        {numField("Height (mm)", item.h, (h) => updateItem(item.id, { h, dimSource: "placed" }))}
        {numField("Seats", item.seats, (seats) => updateItem(item.id, { seats }), 1)}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => rotateItem(item.id, 90)} className="flex-1">
          <RotateCw className="size-3.5" strokeWidth={1.75} />
          Rotate 90°
        </Button>
        <span data-numeric className="text-[13px] text-ink-tertiary">{item.rotation}°</span>
      </div>

      {/* The plan/album/cost link, in one panel */}
      <div className="rounded-lg border border-border-subtle bg-surface-sunken p-3">
        <div className="text-xs font-medium text-ink-secondary">Attached reference</div>
        {ref ? (
          <div className="mt-2">
            <div className="flex items-start gap-2.5">
              <span
                className="mt-0.5 size-8 shrink-0 rounded-md"
                style={{ backgroundColor: ref.swatch }}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-ink">
                  {ref.title}
                </div>
                <div data-numeric className="text-[13px] text-ink-secondary">
                  {ref.price != null
                    ? fmtMoney(ref.price, scheme.currency)
                    : "No price yet"}
                  {ref.vendor ? ` · ${ref.vendor}` : ""}
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              {ref.url && (
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[13px] text-link"
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.75} />
                  Shop link
                </a>
              )}
              <button
                onClick={() => detachReference(item.id)}
                className="flex items-center gap-1 text-[13px] text-ink-tertiary hover:text-ink"
              >
                <Unlink className="size-3.5" strokeWidth={1.75} />
                Detach
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-[13px] text-ink-tertiary">
              Still a plain box. Attach a pinned reference and it inherits the real
              dimensions and price.
            </p>
            <select
              className={`${inputClass} mt-2`}
              value=""
              onChange={(e) => {
                if (e.target.value) attachReference(item.id, e.target.value);
              }}
            >
              <option value="">Attach from album…</option>
              {scheme.references.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.price != null ? ` — ${fmtMoney(r.price, scheme.currency)}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Button size="sm" onClick={() => duplicateItem(item.id)} className="flex-1">
          <Copy className="size-3.5" strokeWidth={1.75} />
          Duplicate
        </Button>
        <Button size="sm" variant="danger" onClick={() => removeItem(item.id)}>
          <Trash2 className="size-3.5" strokeWidth={1.75} />
          Delete
        </Button>
      </div>
    </aside>
  );
}
