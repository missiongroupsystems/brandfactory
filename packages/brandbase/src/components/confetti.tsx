'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

/**
 * A burst of paper confetti from where this component sits, drawn on a full-window canvas.
 *
 * A small simulation, not keyframes: keyframes move each piece in straight lines between fixed
 * points, which reads as things dropping. Paper bursts out, is slowed by the air, drifts down at
 * a gentle terminal speed, sways side to side and flips as it tumbles (drawn by squashing its
 * height). Colours are the `--confetti-*` tokens. Nothing is drawn under reduced motion.
 */
const COUNT = 150
const GRAVITY = 0.42
const DRAG = 0.986
const TERMINAL = 5
// Short on purpose: a celebration, then out of the way.
const LIFE_MS = 1900

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  wobble: number
  wobbleSpeed: number
  sway: number
  rotation: number
  spin: number
  tilt: number
  tiltSpeed: number
  w: number
  h: number
  round: boolean
  colour: string
  born: number
}

function makePieces(x: number, y: number, colours: string[], now: number): Piece[] {
  return Array.from({ length: COUNT }, (_, i) => {
    // Upward, in a fan about 140° wide, a few pieces faster than the rest.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * ((Math.PI * 7) / 9)
    const speed = 7 + Math.random() * 11
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.05 + Math.random() * 0.07,
      sway: 0.6 + Math.random() * 1.4,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.2,
      tilt: Math.random() * Math.PI * 2,
      tiltSpeed: 0.08 + Math.random() * 0.12,
      w: 6 + Math.random() * 5,
      h: 9 + Math.random() * 7,
      round: i % 5 === 0,
      colour: colours[i % colours.length]!,
      born: now + Math.random() * 80,
    }
  })
}

export function Confetti() {
  const anchor = React.useRef<HTMLSpanElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const el = canvas.current
    const from = anchor.current
    if (!el || !from) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    function resize() {
      el!.width = window.innerWidth * dpr
      el!.height = window.innerHeight * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const style = getComputedStyle(document.documentElement)
    const colours = [1, 2, 3, 4, 5, 6].map((n) => style.getPropertyValue(`--confetti-${n}`).trim())
    const box = from.getBoundingClientRect()
    const start = performance.now()
    let pieces = makePieces(box.left, box.top, colours, start)
    let last = start
    let frame = 0

    function tick(now: number) {
      // Steps are in 60fps units, so a slow or fast display moves pieces at the same speed.
      const dt = Math.min((now - last) / (1000 / 60), 3)
      last = now
      ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight)

      pieces = pieces.filter((p) => now - p.born < LIFE_MS)
      for (const p of pieces) {
        if (now < p.born) continue
        p.vx *= Math.pow(DRAG, dt)
        p.vy = Math.min(p.vy * Math.pow(DRAG, dt) + GRAVITY * dt, TERMINAL)
        p.wobble += p.wobbleSpeed * dt
        p.tilt += p.tiltSpeed * dt
        p.rotation += p.spin * dt
        p.x += (p.vx + Math.sin(p.wobble) * p.sway) * dt
        p.y += p.vy * dt

        const age = (now - p.born) / LIFE_MS
        ctx!.save()
        ctx!.globalAlpha = age > 0.45 ? Math.max(0, 1 - (age - 0.45) / 0.55) : 1
        ctx!.translate(p.x, p.y)
        ctx!.rotate(p.rotation)
        // The flip: a piece seen edge-on is a thin line, face-on a full rectangle.
        ctx!.scale(1, Math.cos(p.tilt))
        ctx!.fillStyle = p.colour
        if (p.round) {
          ctx!.beginPath()
          ctx!.arc(0, 0, p.w / 2, 0, Math.PI * 2)
          ctx!.fill()
        } else {
          ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
        ctx!.restore()
      }
      if (pieces.length > 0) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <>
      <span
        ref={anchor}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 size-0"
      />
      {/* Shown only after a click, so never on the server; the guard keeps it honest. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <canvas
            ref={canvas}
            aria-hidden="true"
            data-confetti=""
            className="pointer-events-none fixed inset-0 z-[60] size-full"
          />,
          document.body,
        )}
    </>
  )
}
