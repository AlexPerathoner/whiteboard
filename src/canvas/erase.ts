import { polylineBounds } from './strokePath'
import type { InkPoint, Stroke } from './types'

export type EraserMode = 'stroke' | 'point'

/** Squared distance from p to the segment ab, avoiding a sqrt per test. */
function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = ax + t * dx
  const cy = ay + t * dy
  return (px - cx) ** 2 + (py - cy) ** 2
}

/** True when the eraser disc touches any part of the stroke. */
export function touches(stroke: Stroke, cx: number, cy: number, radius: number) {
  const reach = (radius + stroke.size / 2) ** 2
  const pts = stroke.pts
  if (pts.length === 1) return (pts[0][0] - cx) ** 2 + (pts[0][1] - cy) ** 2 <= reach
  for (let i = 1; i < pts.length; i++) {
    if (distSqToSegment(cx, cy, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= reach) {
      return true
    }
  }
  return false
}

/**
 * Point eraser: removes only the part of a stroke under the disc and returns
 * whatever survives, as separate strokes.
 *
 * Erasing through the middle of a stroke yields two pieces, which is why this
 * returns an array rather than a modified stroke. An empty array means the
 * whole thing was covered.
 */
export function splitStroke(
  stroke: Stroke,
  cx: number,
  cy: number,
  radius: number,
): Stroke[] {
  const reach = (radius + stroke.size / 2) ** 2
  const keep = stroke.pts.map(
    (p) => (p[0] - cx) ** 2 + (p[1] - cy) ** 2 > reach,
  )
  if (keep.every(Boolean)) return [stroke]

  const pieces: Stroke[] = []
  let run: InkPoint[] = []
  const flush = () => {
    // A single surviving point is a dot the user did not draw; drop it.
    if (run.length >= 2) {
      pieces.push({
        ...stroke,
        id: crypto.randomUUID(),
        pts: run,
        bounds: polylineBounds(run, stroke.size),
      })
    }
    run = []
  }
  for (let i = 0; i < stroke.pts.length; i++) {
    if (keep[i]) run.push(stroke.pts[i])
    else flush()
  }
  flush()
  return pieces
}
