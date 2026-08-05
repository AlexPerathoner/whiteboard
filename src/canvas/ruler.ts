/**
 * The on-canvas ruler: a straight edge you position once and then ink along,
 * as in MS Whiteboard. It is chrome rather than content -- it never enters the
 * document and is not persisted.
 *
 * Geometry is stored in *screen* space so the ruler stays the same physical
 * size on screen at every zoom, which is what makes it usable as a tool.
 */
export interface RulerState {
  /** Centre, in screen pixels. */
  cx: number
  cy: number
  /** Radians, 0 = pointing right. */
  angle: number
  length: number
}

export const RULER_HEIGHT = 64
/** How close, in screen pixels, ink must be to the edge before it snaps. */
export const RULER_SNAP_PX = 40
/** Grab zone at each end that rotates instead of moving. */
export const RULER_HANDLE_PX = 44

export function defaultRuler(cssW: number, cssH: number): RulerState {
  return { cx: cssW / 2, cy: cssH / 2, angle: 0, length: Math.min(720, cssW * 0.6) }
}

function unit(r: RulerState): [number, number] {
  return [Math.cos(r.angle), Math.sin(r.angle)]
}

/** Signed distance along the edge, and perpendicular offset from it. */
export function project(r: RulerState, sx: number, sy: number): { along: number; off: number } {
  const [ux, uy] = unit(r)
  const dx = sx - r.cx
  const dy = sy - r.cy
  return { along: dx * ux + dy * uy, off: -dx * uy + dy * ux }
}

/** Which edge of the ruler a stroke is drawn against. */
export type RulerSide = 1 | -1

/** The edge the pointer is currently nearest -- picked once per stroke. */
export function sideFor(r: RulerState, sx: number, sy: number): RulerSide {
  return project(r, sx, sy).off < 0 ? -1 : 1
}

/**
 * Snaps a screen point onto one of the ruler's drawing edges.
 *
 * `side` is fixed for the whole stroke by the caller. Deriving it per sample
 * instead looks right until the pointer wanders inside the ruler body, where
 * the sign of the offset flips and the ink jumps the full width of the ruler
 * from one edge to the other.
 *
 * Returns null outside the ruler's length or beyond RULER_SNAP_PX, so strokes
 * meant to cross the ruler are not captured by it.
 */
export function snapToRuler(
  r: RulerState,
  sx: number,
  sy: number,
  side: RulerSide,
): [number, number] | null {
  const { along, off } = project(r, sx, sy)
  const half = r.length / 2
  if (along < -half || along > half) return null
  const edge = RULER_HEIGHT / 2
  // Distance to the chosen edge, signed so that being inside the body counts
  // as touching it rather than as being far away on the other side.
  if (off * side < -edge || off * side - edge > RULER_SNAP_PX) return null
  const offset = edge * side
  return [r.cx + ux(r) * along - uy(r) * offset, r.cy + uy(r) * along + ux(r) * offset]
}

const ux = (r: RulerState) => Math.cos(r.angle)
const uy = (r: RulerState) => Math.sin(r.angle)

export type RulerGrab = 'move' | 'rotate' | null

/** Which part of the ruler a screen point is on, if any. */
export function grabAt(r: RulerState, sx: number, sy: number): RulerGrab {
  const { along, off } = project(r, sx, sy)
  const half = r.length / 2
  if (Math.abs(off) > RULER_HEIGHT / 2 || Math.abs(along) > half) return null
  return Math.abs(along) > half - RULER_HANDLE_PX ? 'rotate' : 'move'
}

export function drawRuler(ctx: CanvasRenderingContext2D, r: RulerState) {
  const half = r.length / 2
  const h = RULER_HEIGHT / 2

  ctx.save()
  ctx.translate(r.cx, r.cy)
  ctx.rotate(r.angle)

  ctx.fillStyle = 'rgba(31, 31, 31, 0.06)'
  ctx.strokeStyle = 'rgba(31, 31, 31, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.rect(-half, -h, r.length, RULER_HEIGHT)
  ctx.fill()
  ctx.stroke()

  // Ticks every 10px, longer every 50 -- the cue that tells you it is a ruler
  // rather than a selection box.
  ctx.strokeStyle = 'rgba(31, 31, 31, 0.45)'
  ctx.beginPath()
  for (let d = -Math.floor(half / 10) * 10; d <= half; d += 10) {
    const long = Math.round(d) % 50 === 0
    const len = long ? 14 : 8
    ctx.moveTo(d + 0.5, -h)
    ctx.lineTo(d + 0.5, -h + len)
    ctx.moveTo(d + 0.5, h)
    ctx.lineTo(d + 0.5, h - len)
  }
  ctx.stroke()

  // Rotation grips at both ends.
  ctx.fillStyle = 'rgba(91, 49, 141, 0.75)'
  for (const x of [-half + RULER_HANDLE_PX / 2, half - RULER_HANDLE_PX / 2]) {
    ctx.beginPath()
    ctx.arc(x, 0, 6, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/** Keeps the ruler on screen after a viewport resize. */
export function clampRuler(r: RulerState, cssW: number, cssH: number): RulerState {
  return {
    ...r,
    cx: Math.min(Math.max(r.cx, 0), cssW),
    cy: Math.min(Math.max(r.cy, 0), cssH),
  }
}
