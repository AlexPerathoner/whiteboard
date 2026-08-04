import { buildOutlinePath, outlineFor } from './strokePath'
import { DEFAULT_TUNING, type InkPoint, type InkStyle, type InkTuning, type Stroke } from './types'
import {
  applyViewport,
  IDENTITY_VIEWPORT,
  sizeCanvas,
  worldToScreen,
  type Rect,
  type Viewport,
} from './viewport'

export { IDENTITY_VIEWPORT }
export type { Viewport }

export interface InkEngineOptions {
  desynchronized?: boolean
  /** Highlighter blending. 'alpha' = plain translucency, 'multiply' = CSS blend. */
  highlighterBlend?: 'alpha' | 'multiply'
}

export interface InkStats {
  /** Pointer samples delivered by the browser. */
  events: number
  /** Samples that survived the degenerate-distance filter and hit the spine. */
  points: number
  /** Worst synchronous time spent inside one pointer sample, in ms. */
  worstSampleMs: number
  lastSampleMs: number
  /** 'rawupdate' once a pointerrawupdate has been seen, else 'move'. */
  source: string
}

/**
 * Consecutive tail re-outlines must overlap by several points or the round
 * caps become the only thing joining them, and a thin fast stroke breaks into
 * dashes. 8 is the working value; below this is debug territory.
 */
export const MIN_TAIL_WINDOW = 4

/**
 * Renders the in-progress ("wet") stroke.
 *
 * Everything here runs synchronously inside the pointer event handler, so the
 * per-sample cost has to stay flat regardless of how long the stroke is. That
 * is what the tail window buys: only the last `tuning.window` spine points are
 * re-outlined and refilled per sample.
 */
export class InkEngine {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  /** Full-opacity accumulation buffer, used only when the stroke is translucent. */
  private buffer: HTMLCanvasElement | null = null
  private bufferCtx: CanvasRenderingContext2D | null = null

  private vp: Viewport = { ...IDENTITY_VIEWPORT }
  private dpr = 1

  private spine: InkPoint[] = []
  /** Last unfiltered pointer position, so the stroke can end exactly there. */
  private lastRaw: [number, number] | null = null
  private style: InkStyle | null = null
  private tuning: InkTuning = DEFAULT_TUNING
  private pressure = 0.5
  private lastTime = 0
  private drawing = false
  private useBuffer = false

  stats: InkStats = { events: 0, points: 0, worstSampleMs: 0, lastSampleMs: 0, source: 'move' }

  private opts: InkEngineOptions

  constructor(canvas: HTMLCanvasElement, opts: InkEngineOptions = {}) {
    this.canvas = canvas
    this.opts = opts
    const ctx = canvas.getContext('2d', {
      desynchronized: opts.desynchronized ?? true,
      alpha: true,
    })
    if (!ctx) throw new Error('2d context unavailable')
    this.ctx = ctx
  }

  resize(cssW: number, cssH: number, dpr = window.devicePixelRatio || 1) {
    this.dpr = dpr
    sizeCanvas(this.canvas, cssW, cssH, dpr)
    if (this.buffer) {
      this.buffer.width = this.canvas.width
      this.buffer.height = this.canvas.height
    }
  }

  setViewport(vp: Viewport) {
    this.vp = vp
  }

  setTuning(tuning: InkTuning) {
    this.tuning = tuning
  }

  private applyTransform(ctx: CanvasRenderingContext2D) {
    applyViewport(ctx, this.vp, this.dpr)
  }

  private ensureBuffer(): CanvasRenderingContext2D {
    if (!this.bufferCtx) {
      this.buffer = document.createElement('canvas')
      this.buffer.width = this.canvas.width
      this.buffer.height = this.canvas.height
      const bctx = this.buffer.getContext('2d', { alpha: true })
      if (!bctx) throw new Error('buffer 2d context unavailable')
      this.bufferCtx = bctx
    }
    return this.bufferCtx
  }

  begin(worldX: number, worldY: number, time: number, style: InkStyle) {
    this.drawing = true
    this.style = style
    this.spine = [[worldX, worldY, 0.5]]
    this.lastRaw = [worldX, worldY]
    this.pressure = 0.5
    this.lastTime = time
    this.stats = { ...this.stats, events: 1, points: 1, worstSampleMs: 0, lastSampleMs: 0 }

    // Translucent ink must be composited exactly once, or every overlap and
    // self-crossing inside a single stroke darkens. So it accumulates at full
    // opacity in an offscreen buffer and gets blitted through globalAlpha.
    this.useBuffer = style.opacity < 100 || style.tool === 'highlighter'
    if (this.useBuffer) {
      const b = this.ensureBuffer()
      b.setTransform(1, 0, 0, 1, 0, 0)
      b.clearRect(0, 0, this.buffer!.width, this.buffer!.height)
    }

    this.canvas.style.mixBlendMode =
      style.tool === 'highlighter' && this.opts.highlighterBlend === 'multiply'
        ? 'multiply'
        : 'normal'

    // A tap with no drag still leaves a dot, same as MS Whiteboard. That needs
    // `last: true`, otherwise a one-point spine outlines to nothing.
    this.drawTail(true)
  }

  extend(worldX: number, worldY: number, time: number, source?: string) {
    if (!this.drawing || !this.style) return
    const t0 = performance.now()
    if (source) this.stats.source = source
    this.stats.events++

    // Reject duplicate samples on the *raw* delta. Gating on the streamlined
    // delta would scale the threshold by (1 - streamline), so at high
    // streamline real hand movement gets rejected and the spine advances in
    // quantised jerks -- stair-stepping, caused by the very knob meant to
    // smooth the line.
    const prevRaw = this.lastRaw ?? [worldX, worldY]
    const rawDist = Math.hypot(worldX - prevRaw[0], worldY - prevRaw[1])
    const dt = Math.max(1, time - this.lastTime)
    // Advanced before the gate: otherwise dt spans the rejected samples while
    // the distance covers only the accepted move, so speed reads low and the
    // stroke fattens during slow drags.
    this.lastTime = time
    if (rawDist < 0.15 / this.vp.z) return

    this.lastRaw = [worldX, worldY]
    const prev = this.spine[this.spine.length - 1]
    const k = 1 - Math.min(0.95, Math.max(0, this.tuning.streamline))
    const x = prev[0] + (worldX - prev[0]) * k
    const y = prev[1] + (worldY - prev[1]) * k

    const speed = (rawDist * this.vp.z) / dt // screen px per ms
    const target = 1 - Math.min(1, speed / this.tuning.speedToPressure)
    const ps = Math.min(1, Math.max(0, this.tuning.pressureSmoothing))
    this.pressure = this.pressure * ps + target * (1 - ps)

    this.spine.push([x, y, this.pressure])
    this.stats.points++
    this.drawTail(false)

    const ms = performance.now() - t0
    this.stats.lastSampleMs = ms
    if (ms > this.stats.worstSampleMs) this.stats.worstSampleMs = ms
  }

  private drawTail(last: boolean) {
    const style = this.style
    if (!style) return
    const w = Math.max(MIN_TAIL_WINDOW, this.tuning.window)
    const tail = this.spine.slice(Math.max(0, this.spine.length - w))
    const outline = outlineFor(tail, style.size, this.tuning, last)
    if (outline.length === 0) return

    const { path, bounds } = buildOutlinePath(outline)
    const target = this.useBuffer ? this.ensureBuffer() : this.ctx
    this.applyTransform(target)
    target.globalAlpha = 1
    target.globalCompositeOperation = 'source-over'
    target.fillStyle = style.color
    target.fill(path)

    if (this.useBuffer) this.blit(bounds, style)
  }

  /** Composites the accumulated buffer onto the wet layer for one dirty rect. */
  private blit(bounds: Rect, style: InkStyle) {
    const pad = style.size * 0.5 + 2
    // Build the rect first, then intersect with the canvas -- clamping the
    // origin without adjusting the size would shift the blit for any stroke
    // that runs off the top or left edge.
    const [sx0, sy0] = worldToScreen(this.vp, bounds[0] - pad, bounds[1] - pad)
    const [sx1, sy1] = worldToScreen(this.vp, bounds[2] + pad, bounds[3] + pad)
    const x0 = Math.floor(sx0 * this.dpr)
    const y0 = Math.floor(sy0 * this.dpr)
    const x1 = Math.ceil(sx1 * this.dpr) + 1
    const y1 = Math.ceil(sy1 * this.dpr) + 1
    const dx = Math.max(0, x0)
    const dy = Math.max(0, y0)
    const dw = Math.min(this.canvas.width, x1) - dx
    const dh = Math.min(this.canvas.height, y1) - dy
    if (dw <= 0 || dh <= 0) return

    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(dx, dy, dw, dh)
    ctx.globalAlpha = style.opacity / 100
    ctx.drawImage(this.buffer!, dx, dy, dw, dh, dx, dy, dw, dh)
    ctx.globalAlpha = 1
  }

  /**
   * Finishes the stroke and returns it together with its outline path.
   *
   * The path is handed back rather than rebuilt by the committed layer: pen-up
   * is the most visible hitch point in the whole app, and building the
   * full-spine outline twice there was doubling the cost of it.
   */
  end(): { stroke: Stroke; path: Path2D } | null {
    if (!this.drawing || !this.style) return null
    this.drawing = false

    // The streamline filter always trails the pointer. Left alone the stroke
    // stops short of where the user actually lifted, which reads as the ink
    // "not keeping up". Landing the spine on the true final position fixes it.
    const tip = this.spine[this.spine.length - 1]
    if (this.lastRaw && Math.hypot(this.lastRaw[0] - tip[0], this.lastRaw[1] - tip[1]) > 0.1) {
      this.spine.push([this.lastRaw[0], this.lastRaw[1], this.pressure])
    }
    this.drawTail(true)

    const style = this.style
    const pts = this.spine
    const { path, bounds } = buildOutlinePath(outlineFor(pts, style.size, this.tuning, true))
    const stroke: Stroke = {
      id: crypto.randomUUID(),
      type: 'stroke',
      pts,
      color: style.color,
      size: style.size,
      opacity: style.opacity,
      tool: style.tool,
      bounds,
    }

    this.style = null
    this.spine = []
    this.lastRaw = null
    return { stroke, path }
  }

  clear() {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.canvas.style.mixBlendMode = 'normal'
  }

}

/**
 * Outline path for a finished stroke, cached in *world* space: `size` is in
 * world units, so the outline is zoom-independent and never needs rebuilding
 * on pan or zoom.
 */
export function strokePath(
  stroke: Stroke,
  tuning: InkTuning,
  cache?: Map<string, Path2D>,
): Path2D {
  const hit = cache?.get(stroke.id)
  if (hit) return hit
  const { path } = buildOutlinePath(outlineFor(stroke.pts, stroke.size, tuning, true))
  cache?.set(stroke.id, path)
  return path
}

/** Draws a finished stroke onto any context already in world transform. */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  tuning: InkTuning,
  cache?: Map<string, Path2D>,
  highlighterBlend: 'alpha' | 'multiply' = 'alpha',
) {
  const path = strokePath(stroke, tuning, cache)
  ctx.save()
  ctx.globalAlpha = stroke.opacity / 100
  // Must match how the wet layer blended it, or ink changes appearance the
  // instant the pointer lifts.
  if (stroke.tool === 'highlighter' && highlighterBlend === 'multiply') {
    ctx.globalCompositeOperation = 'multiply'
  }
  ctx.fillStyle = stroke.color
  ctx.fill(path)
  ctx.restore()
}
