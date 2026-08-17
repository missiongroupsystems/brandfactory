"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import { Segmented } from "@/features/spaces/components/ui";
import { useSchemeStore } from "@/features/spaces/store";
import type { OpeningKind, Point } from "@/features/spaces/types";
import { polygonBounds, polygonAreaM2 } from "@/features/spaces/derive";
import { fmtArea, fmtLength } from "@/features/spaces/format";
import {
  DEFAULT_OPENING_WIDTHS,
  ITEM_COLORS,
  OPENING_KIND_LABELS,
  ROOM_COLORS,
  WALL_T,
  placeOpening,
  polygonPath,
  projectPointToBoundary,
  snap,
} from "@/features/spaces/plan-geometry";

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MARGIN = 900;

const OPENING_KINDS: OpeningKind[] = ["door", "double-door", "window", "entrance"];

type DragState =
  | { kind: "item"; id: string; dx: number; dy: number }
  | { kind: "pan"; startX: number; startY: number; vb: ViewBox }
  | { kind: "vertex"; index: number }
  | {
      kind: "edge";
      index: number;
      start: Point;
      origA: Point;
      origB: Point;
      nx: number;
      ny: number;
    }
  | { kind: "opening"; id: string; dx: number; dy: number }
  | { kind: "opening-resize"; id: string; end: "start" | "end" };

export function PlanCanvas() {
  const scheme = useSchemeStore((s) => s.scheme);
  const selectedItemId = useSchemeStore((s) => s.selectedItemId);
  const selectItem = useSchemeStore((s) => s.selectItem);
  const updateItem = useSchemeStore((s) => s.updateItem);
  const removeItem = useSchemeStore((s) => s.removeItem);
  const rotateItem = useSchemeStore((s) => s.rotateItem);
  const planMode = useSchemeStore((s) => s.planMode);
  const setPlanMode = useSchemeStore((s) => s.setPlanMode);
  const wallSelection = useSchemeStore((s) => s.wallSelection);
  const selectWall = useSchemeStore((s) => s.selectWall);
  const updateBoundaryVertex = useSchemeStore((s) => s.updateBoundaryVertex);
  const insertBoundaryVertex = useSchemeStore((s) => s.insertBoundaryVertex);
  const removeBoundaryVertex = useSchemeStore((s) => s.removeBoundaryVertex);
  const setEdgePosition = useSchemeStore((s) => s.setEdgePosition);
  const addOpening = useSchemeStore((s) => s.addOpening);
  const updateOpening = useSchemeStore((s) => s.updateOpening);
  const moveOpeningTo = useSchemeStore((s) => s.moveOpeningTo);
  const resizeOpeningTo = useSchemeStore((s) => s.resizeOpeningTo);
  const removeOpening = useSchemeStore((s) => s.removeOpening);

  const walls = planMode === "walls";
  /** Armed opening kind — the next click on a wall places it. */
  const [armed, setArmed] = useState<OpeningKind | null>(null);
  /** Pointer position in plan mm, tracked while a placement tool is armed. */
  const [hoverPt, setHoverPt] = useState<Point | null>(null);

  const { boundary, openings, columns } = scheme.unit;
  const bounds = useMemo(() => polygonBounds(boundary), [boundary]);

  const fitBox = useCallback(
    (): ViewBox => ({
      x: bounds.minX - MARGIN,
      y: bounds.minY - MARGIN,
      w: bounds.w + MARGIN * 2,
      h: bounds.h + MARGIN * 2,
    }),
    [bounds],
  );

  const [vb, setVb] = useState<ViewBox>(fitBox);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  /** Capture the pointer on the SVG and start a drag — refs stay out of render. */
  const beginDrag = useCallback((e: React.PointerEvent, drag: DragState) => {
    e.stopPropagation();
    (e.currentTarget as unknown as SVGGraphicsElement).ownerSVGElement?.setPointerCapture(
      e.pointerId,
    );
    dragRef.current = drag;
  }, []);

  /** Convert a pointer event to plan (mm) coordinates. */
  const toPlan = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const r = svg.getBoundingClientRect();
      // preserveAspectRatio="xMidYMid meet" — figure out the effective scale
      const scale = Math.max(vb.w / r.width, vb.h / r.height);
      const drawnW = vb.w / scale;
      const drawnH = vb.h / scale;
      const padX = (r.width - drawnW) / 2;
      const padY = (r.height - drawnH) / 2;
      return {
        x: vb.x + (e.clientX - r.left - padX) * scale,
        y: vb.y + (e.clientY - r.top - padY) * scale,
      };
    },
    [vb],
  );

  // Wheel zoom needs a non-passive listener to preventDefault
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
      setVb((prev) => {
        const w = Math.min(60000, Math.max(2500, prev.w * factor));
        const scale = w / prev.w;
        const r = svg.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        return {
          x: prev.x + prev.w * px * (1 - scale),
          y: prev.y + prev.h * py * (1 - scale),
          w,
          h: prev.h * scale,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard: delete, rotate, nudge, deselect — for items or, in Walls mode,
  // for corners and openings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")
        return;
      const step = e.shiftKey ? 100 : 25;

      if (walls) {
        if (e.key === "Escape") {
          if (armed) setArmed(null);
          else selectWall(null);
          return;
        }
        const sel = wallSelection;
        if (!sel) return;
        const { boundary: b, openings: ops } = useSchemeStore.getState().scheme.unit;
        if (sel.kind === "vertex") {
          const v = b[sel.index];
          if (!v) return;
          switch (e.key) {
            case "Delete":
            case "Backspace":
              e.preventDefault();
              removeBoundaryVertex(sel.index);
              break;
            case "ArrowLeft":
              e.preventDefault();
              updateBoundaryVertex(sel.index, v.x - step, v.y);
              break;
            case "ArrowRight":
              e.preventDefault();
              updateBoundaryVertex(sel.index, v.x + step, v.y);
              break;
            case "ArrowUp":
              e.preventDefault();
              updateBoundaryVertex(sel.index, v.x, v.y - step);
              break;
            case "ArrowDown":
              e.preventDefault();
              updateBoundaryVertex(sel.index, v.x, v.y + step);
              break;
          }
        } else if (sel.kind === "opening") {
          const op = ops.find((o) => o.id === sel.id);
          if (!op) return;
          switch (e.key) {
            case "Delete":
            case "Backspace":
              e.preventDefault();
              removeOpening(sel.id);
              break;
            case "ArrowLeft":
            case "ArrowUp":
              e.preventDefault();
              updateOpening(sel.id, { offset: op.offset - step });
              break;
            case "ArrowRight":
            case "ArrowDown":
              e.preventDefault();
              updateOpening(sel.id, { offset: op.offset + step });
              break;
          }
        }
        return;
      }

      if (!selectedItemId) return;
      const item = useSchemeStore
        .getState()
        .scheme.items.find((i) => i.id === selectedItemId);
      if (!item) return;
      switch (e.key) {
        case "Delete":
        case "Backspace":
          e.preventDefault();
          removeItem(selectedItemId);
          break;
        case "r":
        case "R":
          rotateItem(selectedItemId, 90);
          break;
        case "Escape":
          selectItem(null);
          break;
        case "ArrowLeft":
          e.preventDefault();
          updateItem(selectedItemId, { x: item.x - step });
          break;
        case "ArrowRight":
          e.preventDefault();
          updateItem(selectedItemId, { x: item.x + step });
          break;
        case "ArrowUp":
          e.preventDefault();
          updateItem(selectedItemId, { y: item.y - step });
          break;
        case "ArrowDown":
          e.preventDefault();
          updateItem(selectedItemId, { y: item.y + step });
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedItemId,
    removeItem,
    rotateItem,
    selectItem,
    updateItem,
    walls,
    armed,
    wallSelection,
    selectWall,
    removeBoundaryVertex,
    updateBoundaryVertex,
    removeOpening,
    updateOpening,
  ]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (armed) setHoverPt(toPlan(e));
      const drag = dragRef.current;
      if (!drag) return;
      switch (drag.kind) {
        case "item": {
          const p = toPlan(e);
          updateItem(drag.id, { x: snap(p.x + drag.dx), y: snap(p.y + drag.dy) });
          break;
        }
        case "vertex": {
          const p = toPlan(e);
          updateBoundaryVertex(drag.index, snap(p.x), snap(p.y));
          break;
        }
        case "edge": {
          // The wall slides along its normal; corners stay connected.
          const p = toPlan(e);
          const dn = snap(
            (p.x - drag.start.x) * drag.nx + (p.y - drag.start.y) * drag.ny,
          );
          setEdgePosition(
            drag.index,
            { x: drag.origA.x + drag.nx * dn, y: drag.origA.y + drag.ny * dn },
            { x: drag.origB.x + drag.nx * dn, y: drag.origB.y + drag.ny * dn },
          );
          break;
        }
        case "opening": {
          const p = toPlan(e);
          moveOpeningTo(drag.id, p.x + drag.dx, p.y + drag.dy);
          break;
        }
        case "opening-resize": {
          const p = toPlan(e);
          resizeOpeningTo(drag.id, drag.end, p.x, p.y);
          break;
        }
        case "pan": {
          const svg = svgRef.current;
          if (!svg) return;
          const r = svg.getBoundingClientRect();
          const scale = Math.max(drag.vb.w / r.width, drag.vb.h / r.height);
          setVb({
            ...drag.vb,
            x: drag.vb.x - (e.clientX - drag.startX) * scale,
            y: drag.vb.y - (e.clientY - drag.startY) * scale,
          });
          break;
        }
      }
    },
    [
      armed,
      toPlan,
      updateItem,
      updateBoundaryVertex,
      setEdgePosition,
      moveOpeningTo,
      resizeOpeningTo,
    ],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);


  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let x = bounds.minX; x <= bounds.maxX; x += 500)
      lines.push({ x1: x, y1: bounds.minY, x2: x, y2: bounds.maxY });
    for (let y = bounds.minY; y <= bounds.maxY; y += 500)
      lines.push({ x1: bounds.minX, y1: y, x2: bounds.maxX, y2: y });
    return lines;
  }, [bounds]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-sunken">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* Background — pan + deselect */}
        <rect
          x={vb.x - 1e5}
          y={vb.y - 1e5}
          width={3e5}
          height={3e5}
          fill="transparent"
          onPointerDown={(e) => {
            (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(
              e.pointerId,
            );
            selectItem(null);
            dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, vb };
          }}
        />

        <defs>
          <clipPath id="floor-clip">
            <path d={polygonPath(boundary)} />
          </clipPath>
        </defs>

        {/* Floor */}
        <path d={polygonPath(boundary)} fill="var(--surface-base)" />

        {/* Grid, clipped to the floor */}
        <g clipPath="url(#floor-clip)" pointerEvents="none">
          {gridLines.map((l, i) => (
            <line key={i} {...l} stroke="var(--border-subtle)" strokeWidth={6} />
          ))}
        </g>

        {/* Rooms */}
        {scheme.rooms.map((room) => {
          const c = ROOM_COLORS[room.kind];
          return (
            <g key={room.id} pointerEvents="none">
              <rect
                x={room.x}
                y={room.y}
                width={room.w}
                height={room.h}
                fill={c}
                fillOpacity={0.07}
                stroke={c}
                strokeOpacity={0.45}
                strokeWidth={10}
                strokeDasharray="130 90"
              />
              <text
                x={room.x + 160}
                y={room.y + 330}
                fontSize={240}
                fontWeight={500}
                fill={c}
                style={{ fontFamily: "var(--font-sans-family)" }}
              >
                {room.name}
              </text>
              <text
                x={room.x + 160}
                y={room.y + 620}
                fontSize={190}
                fill="var(--color-text-tertiary)"
                style={{ fontFamily: "var(--font-sans-family)" }}
              >
                {fmtArea((room.w * room.h) / 1e6)}
              </text>
            </g>
          );
        })}

        {/* Walls */}
        <path
          d={polygonPath(boundary)}
          fill="none"
          stroke="var(--color-text-primary)"
          strokeWidth={WALL_T}
          strokeLinejoin="miter"
          pointerEvents="none"
        />

        {/* Openings cut into the walls */}
        {openings.map((op) => {
          const p = placeOpening(boundary, op);
          return (
            <g
              key={op.id}
              transform={`translate(${p.cx} ${p.cy}) rotate(${p.angle})`}
              pointerEvents="none"
            >
              <rect
                x={-p.len / 2}
                y={-(WALL_T + 60) / 2}
                width={p.len}
                height={WALL_T + 60}
                fill="var(--surface-base)"
              />
              {op.kind === "window" ? (
                <g stroke="var(--color-text-secondary)" strokeWidth={24}>
                  <line x1={-p.len / 2} y1={-38} x2={p.len / 2} y2={-38} />
                  <line x1={-p.len / 2} y1={38} x2={p.len / 2} y2={38} />
                </g>
              ) : op.kind === "entrance" ? (
                <line
                  x1={-p.len / 2}
                  y1={0}
                  x2={p.len / 2}
                  y2={0}
                  stroke="var(--color-text-secondary)"
                  strokeWidth={24}
                  strokeDasharray="110 90"
                />
              ) : op.kind === "double-door" ? (
                <g
                  stroke="var(--color-text-secondary)"
                  strokeWidth={20}
                  fill="none"
                >
                  <path
                    d={`M ${-p.len / 2} 0 L ${-p.len / 2} ${-p.len / 2} A ${p.len / 2} ${p.len / 2} 0 0 1 0 0`}
                  />
                  <path
                    d={`M ${p.len / 2} 0 L ${p.len / 2} ${-p.len / 2} A ${p.len / 2} ${p.len / 2} 0 0 0 0 0`}
                  />
                </g>
              ) : (
                <g stroke="var(--color-text-secondary)" strokeWidth={20} fill="none">
                  <path
                    d={`M ${-p.len / 2} 0 L ${-p.len / 2} ${-p.len} A ${p.len} ${p.len} 0 0 1 ${p.len / 2} 0`}
                  />
                </g>
              )}
            </g>
          );
        })}

        {/* Columns */}
        {columns.map((col) => (
          <rect
            key={col.id}
            x={col.x - col.size / 2}
            y={col.y - col.size / 2}
            width={col.size}
            height={col.size}
            fill="var(--color-text-primary)"
            pointerEvents="none"
          />
        ))}

        {/* Items — spectators while the shell is being edited */}
        <g
          opacity={walls ? 0.35 : 1}
          pointerEvents={walls ? "none" : undefined}
        >
        {scheme.items.map((item) => {
          const selected = item.id === selectedItemId;
          const tint = ITEM_COLORS[item.category];
          const flipLabel = item.rotation > 90 && item.rotation <= 270;
          return (
            <g
              key={item.id}
              transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}
              className="cursor-move"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(
                  e.pointerId,
                );
                selectItem(item.id);
                const p = toPlan(e);
                dragRef.current = {
                  kind: "item",
                  id: item.id,
                  dx: item.x - p.x,
                  dy: item.y - p.y,
                };
              }}
            >
              <rect
                x={-item.w / 2}
                y={-item.d / 2}
                width={item.w}
                height={item.d}
                rx={50}
                fill={tint}
                fillOpacity={0.14}
                stroke={selected ? "var(--color-brand-accent)" : tint}
                strokeOpacity={selected ? 1 : 0.9}
                strokeWidth={selected ? 40 : 22}
              />
              {item.refId && (
                <circle
                  cx={item.w / 2 - 110}
                  cy={-item.d / 2 + 110}
                  r={55}
                  fill="var(--color-feedback-success)"
                />
              )}
              {item.w >= 750 && item.d >= 380 && (
                <text
                  transform={flipLabel ? "rotate(180)" : undefined}
                  x={0}
                  y={55}
                  textAnchor="middle"
                  fontSize={165}
                  fill="var(--color-text-secondary)"
                  pointerEvents="none"
                  style={{ fontFamily: "var(--font-sans-family)" }}
                >
                  {item.name}
                </text>
              )}
              {selected &&
                [
                  [-item.w / 2, -item.d / 2],
                  [item.w / 2, -item.d / 2],
                  [item.w / 2, item.d / 2],
                  [-item.w / 2, item.d / 2],
                ].map(([hx, hy], i) => (
                  <rect
                    key={i}
                    x={hx - 70}
                    y={hy - 70}
                    width={140}
                    height={140}
                    fill="var(--surface-base)"
                    stroke="var(--color-brand-accent)"
                    strokeWidth={26}
                  />
                ))}
            </g>
          );
        })}
        </g>

        {/* Walls mode — the trace itself becomes editable */}
        {walls && (
          <g>
            {/* Wall segments: click to select, drag to push in/out */}
            {boundary.map((a, i) => {
              const b = boundary[(i + 1) % boundary.length];
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              // Outward normal for the store's clockwise (y-down) winding
              const ox = uy;
              const oy = -ux;
              const selected =
                wallSelection?.kind === "edge" && wallSelection.index === i;
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
              const labelAngle = angle > 90 || angle <= -90 ? angle + 180 : angle;
              const lx = (a.x + b.x) / 2 + ox * (WALL_T / 2 + 330);
              const ly = (a.y + b.y) / 2 + oy * (WALL_T / 2 + 330);
              return (
                <g key={`edge-${i}`}>
                  {selected && (
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="var(--color-brand-accent)"
                      strokeWidth={WALL_T + 30}
                      strokeOpacity={0.85}
                      pointerEvents="none"
                    />
                  )}
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="transparent"
                    strokeWidth={WALL_T + 280}
                    className="cursor-move"
                    onPointerDown={(e) => {
                      selectWall({ kind: "edge", index: i });
                      beginDrag(e, {
                        kind: "edge",
                        index: i,
                        start: toPlan(e),
                        origA: { ...a },
                        origB: { ...b },
                        nx: ox,
                        ny: oy,
                      });
                    }}
                  />
                  <text
                    x={lx}
                    y={ly}
                    transform={`rotate(${labelAngle} ${lx} ${ly})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={175}
                    data-numeric
                    fill="var(--color-text-tertiary)"
                    pointerEvents="none"
                    style={{ fontFamily: "var(--font-sans-family)" }}
                  >
                    {fmtLength(len)}
                  </text>
                </g>
              );
            })}

            {/* Openings: click to select, drag along the walls, handles to resize */}
            {openings.map((op) => {
              const p = placeOpening(boundary, op);
              const selected =
                wallSelection?.kind === "opening" && wallSelection.id === op.id;
              const labelAngle =
                p.angle > 90 || p.angle <= -90 ? p.angle + 180 : p.angle;
              // placeOpening's (nx, ny) points outward for the store's winding
              const lx = p.cx + p.nx * (WALL_T / 2 + 330);
              const ly = p.cy + p.ny * (WALL_T / 2 + 330);
              return (
                <g key={`op-hit-${op.id}`}>
                  <g transform={`translate(${p.cx} ${p.cy}) rotate(${p.angle})`}>
                    {selected && (
                      <rect
                        x={-p.len / 2 - 40}
                        y={-(WALL_T + 150) / 2}
                        width={p.len + 80}
                        height={WALL_T + 150}
                        fill="none"
                        stroke="var(--color-brand-accent)"
                        strokeWidth={30}
                        pointerEvents="none"
                      />
                    )}
                    <rect
                      x={-p.len / 2}
                      y={-(WALL_T + 340) / 2}
                      width={p.len}
                      height={WALL_T + 340}
                      fill="transparent"
                      className="cursor-move"
                      onPointerDown={(e) => {
                        selectWall({ kind: "opening", id: op.id });
                        const pt = toPlan(e);
                        beginDrag(e, {
                          kind: "opening",
                          id: op.id,
                          dx: p.cx - pt.x,
                          dy: p.cy - pt.y,
                        });
                      }}
                    />
                    {selected && (
                      <rect
                        x={-p.len / 2 - 85}
                        y={-85}
                        width={170}
                        height={170}
                        fill="var(--surface-base)"
                        stroke="var(--color-brand-accent)"
                        strokeWidth={28}
                        className="cursor-ew-resize"
                        onPointerDown={(e) =>
                          beginDrag(e, {
                            kind: "opening-resize",
                            id: op.id,
                            end: "start",
                          })
                        }
                      />
                    )}
                    {selected && (
                      <rect
                        x={p.len / 2 - 85}
                        y={-85}
                        width={170}
                        height={170}
                        fill="var(--surface-base)"
                        stroke="var(--color-brand-accent)"
                        strokeWidth={28}
                        className="cursor-ew-resize"
                        onPointerDown={(e) =>
                          beginDrag(e, { kind: "opening-resize", id: op.id, end: "end" })
                        }
                      />
                    )}
                  </g>
                  {selected && (
                    <text
                      x={lx}
                      y={ly}
                      transform={`rotate(${labelAngle} ${lx} ${ly})`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={165}
                      data-numeric
                      fill="var(--color-text-secondary)"
                      pointerEvents="none"
                      style={{ fontFamily: "var(--font-sans-family)" }}
                    >
                      {OPENING_KIND_LABELS[op.kind]} · {fmtLength(op.width)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Midpoint handles — press to add a corner and drag it away */}
            {boundary.map((a, i) => {
              const b = boundary[(i + 1) % boundary.length];
              const len = Math.hypot(b.x - a.x, b.y - a.y);
              if (len < 900) return null;
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              return (
                <g
                  key={`mid-${i}`}
                  className="cursor-copy"
                  onPointerDown={(e) => {
                    const idx = insertBoundaryVertex(i, snap(mx), snap(my));
                    if (idx >= 0) {
                      selectWall({ kind: "vertex", index: idx });
                      beginDrag(e, { kind: "vertex", index: idx });
                    } else {
                      e.stopPropagation();
                    }
                  }}
                >
                  <circle
                    cx={mx}
                    cy={my}
                    r={115}
                    fill="var(--surface-base)"
                    stroke="var(--color-text-tertiary)"
                    strokeWidth={26}
                  />
                  <g stroke="var(--color-text-secondary)" strokeWidth={30}>
                    <line x1={mx - 52} y1={my} x2={mx + 52} y2={my} />
                    <line x1={mx} y1={my - 52} x2={mx} y2={my + 52} />
                  </g>
                </g>
              );
            })}

            {/* Corner handles */}
            {boundary.map((v, i) => {
              const selected =
                wallSelection?.kind === "vertex" && wallSelection.index === i;
              return (
                <circle
                  key={`v-${i}`}
                  cx={v.x}
                  cy={v.y}
                  r={selected ? 150 : 125}
                  fill="var(--surface-base)"
                  stroke={
                    selected
                      ? "var(--color-brand-accent)"
                      : "var(--color-text-primary)"
                  }
                  strokeWidth={selected ? 44 : 34}
                  className="cursor-move"
                  onPointerDown={(e) => {
                    selectWall({ kind: "vertex", index: i });
                    beginDrag(e, { kind: "vertex", index: i });
                  }}
                />
              );
            })}

            {/* Ghost preview while a placement tool is armed */}
            {armed &&
              hoverPt &&
              (() => {
                const proj = projectPointToBoundary(boundary, hoverPt.x, hoverPt.y);
                if (!proj || proj.dist > 1500) return null;
                const w = Math.min(DEFAULT_OPENING_WIDTHS[armed], proj.len);
                const a = boundary[proj.edge];
                const b = boundary[(proj.edge + 1) % boundary.length];
                const ux = (b.x - a.x) / proj.len;
                const uy = (b.y - a.y) / proj.len;
                const tC = Math.max(w / 2, Math.min(proj.len - w / 2, proj.t));
                const cx = a.x + ux * tC;
                const cy = a.y + uy * tC;
                const angle = (Math.atan2(uy, ux) * 180) / Math.PI;
                return (
                  <g
                    transform={`translate(${cx} ${cy}) rotate(${angle})`}
                    pointerEvents="none"
                  >
                    <rect
                      x={-w / 2}
                      y={-(WALL_T + 130) / 2}
                      width={w}
                      height={WALL_T + 130}
                      fill="var(--color-brand-accent)"
                      fillOpacity={0.25}
                      stroke="var(--color-brand-accent)"
                      strokeWidth={22}
                      strokeDasharray="95 70"
                    />
                  </g>
                );
              })()}

            {/* Armed: the next click places the opening */}
            {armed && (
              <rect
                x={vb.x - 1e5}
                y={vb.y - 1e5}
                width={3e5}
                height={3e5}
                fill="transparent"
                className="cursor-crosshair"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const p = toPlan(e);
                  const id = addOpening(armed, p.x, p.y);
                  if (id) setArmed(null);
                }}
              />
            )}
          </g>
        )}
      </svg>

      {/* Mode toggle + opening tools — correcting the trace is the same editor */}
      <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
        <div className="rounded-lg bg-surface p-0.5 shadow-e1">
          <Segmented
            options={["layout", "walls"] as const}
            value={planMode}
            onChange={(m) => {
              setPlanMode(m);
              setArmed(null);
              setHoverPt(null);
            }}
            labels={{ layout: "Layout", walls: "Walls" }}
          />
        </div>
        {walls && (
          <div className="flex items-center rounded-lg bg-surface p-1 shadow-e1">
            <span className="pl-2 pr-1.5 text-xs text-ink-tertiary">Add</span>
            {OPENING_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setArmed(armed === k ? null : k)}
                className={`rounded-md px-2.5 py-1 text-[13px] transition-colors duration-120 ${
                  armed === k
                    ? "bg-surface-accent font-medium text-ink-inverse"
                    : "text-ink-secondary hover:bg-surface-hover"
                }`}
              >
                {OPENING_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        )}
        {armed && (
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-ink-secondary shadow-e1">
            Click a wall to place · Esc to cancel
          </span>
        )}
        {walls && !armed && (
          <span className="max-md:hidden rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-ink-secondary shadow-e1">
            Drag corners or walls · press + to add a corner
          </span>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg border border-border bg-surface p-1 shadow-e1">
        <button
          aria-label="Zoom in"
          className="flex size-7 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover"
          onClick={() =>
            setVb((p) => ({
              x: p.x + p.w * 0.09,
              y: p.y + p.h * 0.09,
              w: p.w * 0.82,
              h: p.h * 0.82,
            }))
          }
        >
          <Plus className="size-4" strokeWidth={1.75} />
        </button>
        <button
          aria-label="Zoom out"
          className="flex size-7 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover"
          onClick={() =>
            setVb((p) => ({
              x: p.x - p.w * 0.11,
              y: p.y - p.h * 0.11,
              w: p.w * 1.22,
              h: p.h * 1.22,
            }))
          }
        >
          <Minus className="size-4" strokeWidth={1.75} />
        </button>
        <button
          aria-label="Fit to view"
          className="flex size-7 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-hover"
          onClick={() => setVb(fitBox())}
        >
          <Scan className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      {/* Scale provenance — honest about scale (§ principles) */}
      <div className="absolute bottom-4 right-4 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-ink-secondary shadow-e1">
        Scale {scheme.unit.scale.source} · {scheme.unit.scale.confidence} confidence ·
        grid 500 mm · {fmtArea(polygonAreaM2(boundary))}
      </div>
    </div>
  );
}
