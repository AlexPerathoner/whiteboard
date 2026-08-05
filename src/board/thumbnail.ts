import { paintStroke } from '../canvas/inkEngine'
import { DEFAULT_TUNING, type Stroke, type TextItem, type ZoneItem } from '../canvas/types'
import { unionRects, type Rect } from '../canvas/viewport'

const W = 480
const H = 270

/**
 * Fit-to-content PNG of the board, used for dashboard cards.
 *
 * Text is drawn with `fillText` rather than reproducing the DOM layer's
 * wrapping: at thumbnail scale the difference is invisible, and it keeps this
 * off the critical path.
 */
export async function renderThumbnail(
  strokes: Stroke[],
  texts: TextItem[],
  zones: ZoneItem[] = [],
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const rects: Rect[] = [
    ...zones.map((z): Rect => [z.x, z.y, z.x + z.w, z.y + z.h]),
    ...strokes.map((s) => s.bounds),
    ...texts.map(
      (t): Rect => [t.x, t.y, t.x + t.w, t.y + t.fontSize * 1.4],
    ),
  ]
  const content = unionRects(rects)
  if (content) {
    const pad = 24
    const cw = content[2] - content[0] + pad * 2
    const ch = content[3] - content[1] + pad * 2
    const z0 = Math.min(W / cw, H / ch)
    ctx.setTransform(z0, 0, 0, z0, -(content[0] - pad) * z0, -(content[1] - pad) * z0)

    for (const z of zones) {
      ctx.fillStyle = z.fill
      ctx.fillRect(z.x, z.y, z.w, z.h)
      ctx.strokeStyle = z.stroke
      ctx.lineWidth = 1 / z0
      ctx.strokeRect(z.x, z.y, z.w, z.h)
    }
    for (const s of strokes) paintStroke(ctx, s, DEFAULT_TUNING)
    for (const t of texts) {
      ctx.save()
      ctx.fillStyle = t.color
      ctx.font = `${t.fontSize}px "Segoe UI", system-ui, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(t.text, t.x, t.y, t.w)
      ctx.restore()
    }
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}
