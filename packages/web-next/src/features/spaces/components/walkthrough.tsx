"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PointerLockControls } from "@react-three/drei";
import { Segmented } from "@/features/spaces/components/ui";
import { useSchemeStore } from "@/features/spaces/store";
import { polygonBounds } from "@/features/spaces/derive";
import type { Point, Unit } from "@/features/spaces/types";
import { ITEM_COLORS, ROOM_COLORS, SELECTED_COLOR } from "@/features/spaces/plan-geometry";

/**
 * The same space at eye level. One shared geometry model: plan (x, y) mm
 * maps to world (x, 0, y) metres — nothing is entered twice.
 */

const MM = 1 / 1000;
const WALL_T = 0.15;
const DOOR_HEAD = 2.1;
const SILL = 0.9;
const WINDOW_HEAD = 2.5;

type Mode = "orbit" | "walk";

interface WallBox {
  cx: number;
  cz: number;
  len: number;
  angle: number;
  y0: number;
  y1: number;
}

/** Split each boundary edge into full/partial-height boxes around its openings. */
function buildWallBoxes(unit: Unit): WallBox[] {
  const pts = unit.boundary;
  const H = unit.ceilingHeight * MM;
  const boxes: WallBox[] = [];

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) * MM;
    const ux = dx / (len / MM);
    const uy = dy / (len / MM);
    const angle = -Math.atan2(dy, dx);

    const put = (s0: number, s1: number, y0: number, y1: number) => {
      if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
      const mid = (s0 + s1) / 2;
      boxes.push({
        cx: (a.x + ux * (mid / MM)) * MM,
        cz: (a.y + uy * (mid / MM)) * MM,
        len: s1 - s0,
        angle,
        y0,
        y1,
      });
    };

    const ops = unit.openings
      .filter((o) => o.edge === i)
      .sort((p, q) => p.offset - q.offset);

    let cursor = 0;
    for (const op of ops) {
      const s0 = op.offset * MM;
      const s1 = (op.offset + op.width) * MM;
      put(cursor, s0, 0, H); // solid wall before the opening
      if (op.kind === "window") {
        put(s0, s1, 0, SILL);
        put(s0, s1, WINDOW_HEAD, H);
      } else {
        put(s0, s1, DOOR_HEAD, H); // lintel over doors
      }
      cursor = s1;
    }
    put(cursor, len, 0, H);
  }
  return boxes;
}

function Walls({ unit }: { unit: Unit }) {
  const boxes = useMemo(() => buildWallBoxes(unit), [unit]);
  return (
    <group>
      {boxes.map((wall, i) => (
        <mesh
          key={i}
          position={[wall.cx, (wall.y0 + wall.y1) / 2, wall.cz]}
          rotation={[0, wall.angle, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[wall.len, wall.y1 - wall.y0, WALL_T]} />
          <meshStandardMaterial color="#eceae4" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function Floor({ boundary }: { boundary: Point[] }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    boundary.forEach((p, i) => {
      if (i === 0) s.moveTo(p.x * MM, p.y * MM);
      else s.lineTo(p.x * MM, p.y * MM);
    });
    s.closePath();
    return s;
  }, [boundary]);
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#f1efe9" roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Scene() {
  const scheme = useSchemeStore((s) => s.scheme);
  const selectedItemId = useSchemeStore((s) => s.selectedItemId);
  const selectItem = useSchemeStore((s) => s.selectItem);

  return (
    <group>
      <hemisphereLight intensity={0.85} color="#fffdf7" groundColor="#c9c4b8" />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />

      <Floor boundary={scheme.unit.boundary} />

      {/* Room tints, just above the floor */}
      {scheme.rooms.map((room) => (
        <mesh
          key={room.id}
          position={[(room.x + room.w / 2) * MM, 0.005, (room.y + room.h / 2) * MM]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[room.w * MM, room.h * MM]} />
          <meshBasicMaterial color={ROOM_COLORS[room.kind]} transparent opacity={0.06} />
        </mesh>
      ))}

      <Walls unit={scheme.unit} />

      {scheme.unit.columns.map((col) => (
        <mesh
          key={col.id}
          position={[col.x * MM, (scheme.unit.ceilingHeight * MM) / 2, col.y * MM]}
          castShadow
        >
          <boxGeometry
            args={[col.size * MM, scheme.unit.ceilingHeight * MM, col.size * MM]}
          />
          <meshStandardMaterial color="#d8d5cc" roughness={0.9} />
        </mesh>
      ))}

      {scheme.items.map((item) => {
        const selected = item.id === selectedItemId;
        return (
          <mesh
            key={item.id}
            position={[item.x * MM, (item.h * MM) / 2, item.y * MM]}
            rotation={[0, (-item.rotation * Math.PI) / 180, 0]}
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              selectItem(item.id);
            }}
          >
            <boxGeometry args={[item.w * MM, item.h * MM, item.d * MM]} />
            <meshStandardMaterial
              color={selected ? SELECTED_COLOR : ITEM_COLORS[item.category]}
              roughness={0.85}
              opacity={0.95}
              transparent
            />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * WASD movement at eye level while pointer-locked.
 *
 * `react-hooks/immutability` is disabled for this component, and only this one.
 *
 * The rule says a value returned from a hook must not be modified, which is right for
 * React state and wrong for `@react-three/fiber`: `useThree().camera` is a handle on a
 * live three.js object, and `useFrame` exists precisely so you can mutate it every frame.
 * Rendering a camera position through React state instead would mean a re-render per
 * frame at 60fps for a value React does not draw. There is no version of this that both
 * satisfies the rule and works.
 *
 * Upstream shipped these as four accepted lint errors (`ref-openspace/_CLAUDE.md` names
 * them as expected breakage). That is not available here — this repo's gate is a clean
 * `pnpm lint` — so the exception is narrowed to the seven lines that need it and the
 * reason is written down.
 */
/* eslint-disable react-hooks/immutability */
function WalkMovement() {
  const keys = useRef<Set<string>>(new Set());
  const { camera } = useThree();

  useEffect(() => {
    camera.position.y = 1.6;
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera]);

  useFrame((_, delta) => {
    const k = keys.current;
    const speed = (k.has("ShiftLeft") ? 4.5 : 2.2) * delta;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    if (k.has("KeyW") || k.has("ArrowUp")) camera.position.addScaledVector(fwd, speed);
    if (k.has("KeyS") || k.has("ArrowDown"))
      camera.position.addScaledVector(fwd, -speed);
    if (k.has("KeyA") || k.has("ArrowLeft"))
      camera.position.addScaledVector(right, -speed);
    if (k.has("KeyD") || k.has("ArrowRight"))
      camera.position.addScaledVector(right, speed);
    camera.position.y = 1.6;
  });
  return null;
}
/* eslint-enable react-hooks/immutability */

export function WalkthroughView() {
  const boundary = useSchemeStore((s) => s.scheme.unit.boundary);
  const [mode, setMode] = useState<Mode>("orbit");

  const center = useMemo(() => {
    const b = polygonBounds(boundary);
    return {
      x: (b.minX + b.w / 2) * MM,
      z: (b.minY + b.h / 2) * MM,
      radius: (Math.max(b.w, b.h) * MM) / 2,
    };
  }, [boundary]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        camera={{
          position: [center.x + 8, 9, center.z + 9],
          fov: 50,
        }}
        style={{ background: "#e9e7e1" }}
      >
        <Scene />
        {mode === "orbit" ? (
          <OrbitControls
            target={[center.x, 0.8, center.z]}
            maxPolarAngle={Math.PI / 2.05}
            minDistance={2}
            maxDistance={40}
          />
        ) : (
          <>
            <PointerLockControls />
            <WalkMovement />
          </>
        )}
      </Canvas>

      <div className="absolute left-4 top-4 flex items-center gap-3">
        <div className="rounded-lg bg-surface p-0.5 shadow-e1">
          <Segmented
            options={["orbit", "walk"] as const}
            value={mode}
            onChange={setMode}
            labels={{ orbit: "Orbit", walk: "Walk" }}
          />
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-ink-secondary shadow-e1">
          {mode === "orbit"
            ? "Drag to orbit · scroll to zoom"
            : "Click the space to look around · WASD to move · Esc to release"}
        </span>
      </div>
    </div>
  );
}
