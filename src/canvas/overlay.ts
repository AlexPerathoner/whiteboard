import { drawRuler, type RulerState } from './ruler'
import {
  applyViewport,
  IDENTITY_VIEWPORT,
  normRect,
  sizeCanvas,
  worldToScreen,
  type Rect,
  type Viewport,
} from './viewport'

export type { Rect }

/**
 * Selection chrome: the marquee while dragging, and the dashed box around the
 * current selection. Drawn in screen space so the outline keeps a constant
 * 1px weight at every zoom level, the way MS's does.
 */
export class OverlayLayer {
  private ctx: CanvasRenderingContext2D
  private dpr = 1
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    this.ctx = ctx
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr
    sizeCanvas(this.canvas, cssW, cssH, dpr)
  }

  clear() {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  draw(
    vp: Viewport,
    selection: Rect | null,
    marquee: Rect | null,
    eraser: [number, number] | null = null,
    eraserRadius = 12,
    ruler: RulerState | null = null,
  ) {
    const ctx = this.ctx
    this.clear()
    // Screen space: chrome keeps a constant 1px weight at every zoom.
    applyViewport(ctx, IDENTITY_VIEWPORT, this.dpr)

    if (selection) {
      const [x0, y0] = worldToScreen(vp, selection[0], selection[1])
      const [x1, y1] = worldToScreen(vp, selection[2], selection[3])
      const pad = 6
      ctx.save()
      ctx.strokeStyle = '#5B318D'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect(
        Math.round(x0) - pad + 0.5,
        Math.round(y0) - pad + 0.5,
        Math.round(x1 - x0) + pad * 2,
        Math.round(y1 - y0) + pad * 2,
      )
      ctx.restore()
    }

    if (marquee) {
      const n = normRect(marquee)
      const [x, y] = worldToScreen(vp, n[0], n[1])
      const [mx, my] = worldToScreen(vp, n[2], n[3])
      const w = mx - x
      const h = my - y
      ctx.save()
      ctx.fillStyle = 'rgba(91, 49, 141, 0.08)'
      ctx.strokeStyle = '#5B318D'
      ctx.lineWidth = 1
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h))
      ctx.restore()
    }

    if (ruler) drawRuler(ctx, ruler)

    if (eraser) {
      // Drawn rather than set as a CSS cursor so it scales with the tool and
      // stays visible over dark ink.
      ctx.save()
      ctx.beginPath()
      ctx.arc(eraser[0], eraser[1], eraserRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
      ctx.strokeStyle = '#605e5c'
      ctx.lineWidth = 1
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }
}
