import { applyStrokeStyle, isConstantWidth, paintStroke, strokePath } from './inkEngine'
import type { InkTuning, Stroke, ZoneItem } from './types'
import {
  applyViewport,
  boundsIntersect,
  normRect,
  sizeCanvas,
  visibleBounds,
  type Rect,
  type Viewport,
} from './viewport'

/**
 * The committed layer: every finished stroke. Redrawn on viewport or document
 * change only -- never while a stroke is in progress, which is what keeps the
 * wet layer's per-sample budget flat.
 */
export class CommittedLayer {
  private ctx: CanvasRenderingContext2D
  private dpr = 1
  private cssW = 0
  private cssH = 0
  private frame = 0

  /**
   * Outline paths, keyed by stroke id and deliberately *not* tied to
   * visibility: outlines are cached in world space and are zoom-independent,
   * so evicting on cull would make strokes pay their build cost again every
   * time they scroll back into view.
   */
  private paths = new Map<string, Path2D>()

  strokes: Stroke[] = []
  /** Template backdrops. Painted first, so ink always sits on top. */
  zones: ZoneItem[] = []
  vp: Viewport = { x: 0, y: 0, z: 1 }
  tuning: InkTuning

  /** Strokes drawn in the last frame, for stats/tests. */
  lastDrawn = 0
  lastDrawMs = 0

  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, tuning: InkTuning) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    this.ctx = ctx
    this.tuning = tuning
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.cssW = cssW
    this.cssH = cssH
    this.dpr = dpr
    sizeCanvas(this.canvas, cssW, cssH, dpr)
    this.draw()
  }

  /** Coalesces redraw requests to one per frame. */
  invalidate() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.draw()
    })
  }

  draw() {
    const t0 = performance.now()
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    applyViewport(ctx, this.vp, this.dpr)

    const view = visibleBounds(this.vp, this.cssW, this.cssH)
    for (const z of this.zones) {
      if (!boundsIntersect([z.x, z.y, z.x + z.w, z.y + z.h], view)) continue
      ctx.fillStyle = z.fill
      ctx.fillRect(z.x, z.y, z.w, z.h)
      ctx.strokeStyle = z.stroke
      ctx.lineWidth = 1 / this.vp.z
      ctx.strokeRect(z.x, z.y, z.w, z.h)
    }
    let drawn = 0
    for (const s of this.strokes) {
      if (!boundsIntersect(s.bounds, view)) continue
      paintStroke(ctx, s, this.tuning, this.paths)
      drawn++
    }
    this.lastDrawn = drawn
    this.lastDrawMs = performance.now() - t0
  }

  /**
   * Draws one new stroke without touching everything already on the layer.
   * `path` seeds the cache when the caller already built it -- the ink engine
   * does, at pen-up, and rebuilding it here would double that work.
   */
  append(stroke: Stroke, path?: Path2D) {
    this.strokes.push(stroke)
    if (path) this.paths.set(stroke.id, path)
    const ctx = this.ctx
    applyViewport(ctx, this.vp, this.dpr)
    paintStroke(ctx, stroke, this.tuning, this.paths)
  }

  remove(ids: Set<string>) {
    this.strokes = this.strokes.filter((s) => !ids.has(s.id))
    for (const id of ids) this.paths.delete(id)
    this.invalidate()
  }

  setStrokes(strokes: Stroke[]) {
    this.strokes = strokes
    this.invalidate()
  }

  setZones(zones: ZoneItem[]) {
    this.zones = zones
    this.invalidate()
  }

  // --- geometry queries ----------------------------------------------------

  /**
   * Topmost stroke under a world point, or null.
   *
   * `isPointInPath` interprets its arguments through the current transform, so
   * this runs on a scratch context left at identity -- the cached outlines are
   * already in world space.
   */
  hitTest(wx: number, wy: number, toleranceWorld = 0): Stroke | null {
    const ctx = scratchCtx()
    const t = toleranceWorld
    const constant = isConstantWidth(this.tuning)
    // Thin strokes are hard to land on exactly; probe a small cross. Under
    // constant width the tolerance is simply a fatter test line instead.
    const probes: [number, number][] =
      t > 0 && !constant
        ? [
            [wx, wy],
            [wx - t, wy],
            [wx + t, wy],
            [wx, wy - t],
            [wx, wy + t],
          ]
        : [[wx, wy]]

    const probe: Rect = [wx - t, wy - t, wx + t, wy + t]
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i]
      if (!boundsIntersect(probe, s.bounds)) continue
      const path = strokePath(s, this.tuning, this.paths)
      if (constant) {
        // The cached path is the spine, so the ink's extent is the stroked
        // width -- widened by the tolerance rather than probed around.
        applyStrokeStyle(ctx, s.size + t * 2)
        if (ctx.isPointInStroke(path, wx, wy)) return s
        continue
      }
      for (const [px, py] of probes) {
        if (ctx.isPointInPath(path, px, py)) return s
      }
    }
    return null
  }

  /** Strokes whose bounds intersect a world rect -- the marquee test. */
  strokesIn(rect: Rect): Stroke[] {
    const norm = normRect(rect)
    return this.strokes.filter((s) => boundsIntersect(s.bounds, norm))
  }

  /**
   * Moves strokes in world space. Cached outlines are translated rather than
   * rebuilt -- a move must not pay the outline cost again.
   */
  translate(ids: Set<string>, dx: number, dy: number) {
    for (const s of this.strokes) {
      if (!ids.has(s.id)) continue
      for (const p of s.pts) {
        p[0] += dx
        p[1] += dy
      }
      s.bounds = [s.bounds[0] + dx, s.bounds[1] + dy, s.bounds[2] + dx, s.bounds[3] + dy]
      const old = this.paths.get(s.id)
      if (old) {
        const moved = new Path2D()
        moved.addPath(old, new DOMMatrix().translate(dx, dy))
        this.paths.set(s.id, moved)
      }
    }
    this.invalidate()
  }

  indexOfStroke(id: string) {
    return this.strokes.findIndex((s) => s.id === id)
  }

  /** Restores strokes at their original indices, so z-order survives undo. */
  insertAt(entries: { stroke: Stroke; index: number }[]) {
    const sorted = [...entries].sort((a, b) => a.index - b.index)
    for (const { stroke, index } of sorted) {
      this.strokes.splice(Math.min(index, this.strokes.length), 0, stroke)
    }
    this.invalidate()
  }
}

let scratch: CanvasRenderingContext2D | null = null
function scratchCtx() {
  if (!scratch) {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    scratch = c.getContext('2d')!
  }
  return scratch
}
