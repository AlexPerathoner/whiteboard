import { getStroke } from 'perfect-freehand'
import type { InkPoint, InkTuning } from './types'

/**
 * How the outline points get joined into a path.
 *
 * MS Whiteboard emits straight `L` segments between offset points with `A r,r`
 * arcs at the joins -- no curve smoothing anywhere. `straight` matches that.
 * `quadratic` is the canonical perfect-freehand renderer (quadratics through
 * outline midpoints); it rounds off sharp direction reversals, which MS does
 * not do. Kept switchable so the difference stays measurable.
 */
export type OutlineStyle = 'straight' | 'quadratic'

export let outlineStyle: OutlineStyle = 'straight'

export function setOutlineStyle(style: OutlineStyle) {
  outlineStyle = style
}

/** Turn a perfect-freehand outline into SVG path data. */
export function svgPathFromOutline(points: number[][]): string {
  const len = points.length
  if (len === 0) return ''
  if (len < 4) {
    const [x, y] = points[0]
    return `M ${x.toFixed(2)} ${y.toFixed(2)} Z`
  }

  if (outlineStyle === 'straight') {
    let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`
    for (let i = 1; i < len; i++) {
      d += ` L ${points[i][0].toFixed(2)} ${points[i][1].toFixed(2)}`
    }
    return d + ' Z'
  }

  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)} Q`
  for (let i = 0; i < len; i++) {
    const a = points[i]
    const b = points[(i + 1) % len]
    d += ` ${a[0].toFixed(2)} ${a[1].toFixed(2)} ${((a[0] + b[0]) / 2).toFixed(2)} ${(
      (a[1] + b[1]) /
      2
    ).toFixed(2)}`
  }
  return d + ' Z'
}

/**
 * Outline for a run of spine points.
 *
 * `streamline` is deliberately 0 here: the spine we pass in has already been
 * filtered by the engine, and pressure is explicit. That makes the result
 * depend only on the points given, so re-outlining just the tail of a stroke
 * produces geometry identical to outlining the whole thing -- which is what
 * lets the wet layer draw incrementally without seams.
 */
export function outlineFor(
  pts: InkPoint[],
  size: number,
  tuning: InkTuning,
  last: boolean,
): number[][] {
  return getStroke(pts, {
    size,
    thinning: tuning.thinning,
    smoothing: tuning.smoothing,
    streamline: 0,
    simulatePressure: false,
    last,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
  })
}

/**
 * Builds the fillable path and its bounds in a single pass.
 *
 * The obvious alternative -- format the outline into SVG path data and hand it
 * to `new Path2D(string)` -- runs on every pointer sample, so it pays a
 * `toFixed` per coordinate, builds a large string, and then makes the browser
 * re-parse geometry we already hold as floats. Going straight to the Path2D
 * API skips the round trip, and accumulating min/max here removes a second
 * full pass over the same points.
 */
export function buildOutlinePath(outline: number[][]): {
  path: Path2D
  bounds: [number, number, number, number]
} {
  const path = new Path2D()
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const len = outline.length
  if (len === 0) return { path, bounds: [0, 0, 0, 0] }

  for (let i = 0; i < len; i++) {
    const [x, y] = outline[i]
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }

  if (outlineStyle === 'quadratic' && len >= 4) {
    path.moveTo(outline[0][0], outline[0][1])
    for (let i = 0; i < len; i++) {
      const a = outline[i]
      const b = outline[(i + 1) % len]
      path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    }
  } else {
    path.moveTo(outline[0][0], outline[0][1])
    for (let i = 1; i < len; i++) path.lineTo(outline[i][0], outline[i][1])
  }
  path.closePath()
  return { path, bounds: [x0, y0, x1, y1] }
}

export function outlineBounds(outline: number[][]): [number, number, number, number] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of outline) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

/**
 * The stroke's spine as a plain polyline.
 *
 * With constant width (`thinning: 0`, which is what MS does) the exact shape of
 * the ink is this polyline stroked with round joins and caps -- the same
 * `A r,r` arc geometry MS emits, with r = half the width. Filling a computed
 * outline only approximates that, and loses area where the outline
 * self-intersects on a tight turn, which shows up as bites out of the edge.
 */
export function polylinePath(pts: InkPoint[]): Path2D {
  const path = new Path2D()
  if (pts.length === 0) return path
  path.moveTo(pts[0][0], pts[0][1])
  // A zero-length segment with a round cap is how Canvas2D draws a dot, so a
  // single-point stroke still leaves a mark.
  if (pts.length === 1) path.lineTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1])
  return path
}

/** Bounds of a polyline stroked at `width`, in world units. */
export function polylineBounds(pts: InkPoint[], width: number): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  const r = width / 2
  return [x0 - r, y0 - r, x1 + r, y1 + r]
}
