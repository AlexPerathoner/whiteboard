/**
 * The camera over the infinite canvas. `x`/`y` are the world coordinates of
 * the viewport's top-left corner; `z` is world units per screen pixel.
 */
export interface Viewport {
  x: number
  y: number
  z: number
}

export const IDENTITY_VIEWPORT: Viewport = { x: 0, y: 0, z: 1 }

/**
 * Zoom bounds. The canvas is infinite, but a float64 coordinate loses its
 * sub-pixel precision once the world offset grows large relative to the scale,
 * and browsers cap canvas transforms well before that. These limits are where
 * geometry still renders exactly.
 */
export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 64

export function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

export function screenToWorld(vp: Viewport, sx: number, sy: number): [number, number] {
  return [vp.x + sx / vp.z, vp.y + sy / vp.z]
}

export function worldToScreen(vp: Viewport, wx: number, wy: number): [number, number] {
  return [(wx - vp.x) * vp.z, (wy - vp.y) * vp.z]
}

/** Zooms to `z`, keeping the world point under (sx, sy) pinned to that pixel. */
export function zoomAt(vp: Viewport, z: number, sx: number, sy: number): Viewport {
  const next = clampZoom(z)
  if (next === vp.z) return vp
  const [wx, wy] = screenToWorld(vp, sx, sy)
  return { x: wx - sx / next, y: wy - sy / next, z: next }
}

/** Visible world rect as [x0, y0, x1, y1]. */
export function visibleBounds(
  vp: Viewport,
  cssW: number,
  cssH: number,
): Rect {
  return [vp.x, vp.y, vp.x + cssW / vp.z, vp.y + cssH / vp.z]
}

export type Rect = [number, number, number, number]

export function boundsIntersect(a: Rect, b: Rect) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

/** Orders a rect's corners, so a drag in any direction yields x0<=x1, y0<=y1. */
export function normRect(r: Rect): Rect {
  return [
    Math.min(r[0], r[2]),
    Math.min(r[1], r[3]),
    Math.max(r[0], r[2]),
    Math.max(r[1], r[3]),
  ]
}

/** Smallest rect containing all of `rects`, or null when there are none. */
export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  const out: Rect = [...rects[0]]
  for (const r of rects) {
    if (r[0] < out[0]) out[0] = r[0]
    if (r[1] < out[1]) out[1] = r[1]
    if (r[2] > out[2]) out[2] = r[2]
    if (r[3] > out[3]) out[3] = r[3]
  }
  return out
}

/** Sizes a canvas for the device pixel ratio and its CSS box. */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  dpr: number,
) {
  canvas.width = Math.ceil(cssW * dpr)
  canvas.height = Math.ceil(cssH * dpr)
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
}

/** Applies the world -> device transform to a context. */
export function applyViewport(ctx: CanvasRenderingContext2D, vp: Viewport, dpr: number) {
  const s = vp.z * dpr
  ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s)
}
