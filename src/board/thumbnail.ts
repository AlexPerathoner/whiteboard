import { paintStroke } from '../canvas/inkEngine'
import { DEFAULT_TUNING, type DomItem, type Stroke, type ZoneItem } from '../canvas/types'
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
  items: DomItem[] = [],
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
    ...items.map((i): Rect =>
      i.type === 'text'
        ? [i.x, i.y, i.x + i.w, i.y + i.fontSize * 1.4]
        : [i.x, i.y, i.x + i.size, i.y + i.size],
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
    for (const i of items) {
      ctx.save()
      if (i.type === 'note') {
        ctx.fillStyle = i.color
        ctx.fillRect(i.x, i.y, i.size, i.size)
      } else if (i.type === 'reaction') {
        ctx.font = `${i.size * 0.8}px "Segoe UI Emoji", system-ui, sans-serif`
        ctx.textBaseline = 'top'
        ctx.fillText(i.emoji, i.x, i.y)
      } else {
        ctx.fillStyle = i.color
        ctx.font = `${i.fontSize}px "Segoe UI", system-ui, sans-serif`
        ctx.textBaseline = 'top'
        ctx.fillText(i.text, i.x, i.y, i.w)
      }
      ctx.restore()
    }
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}
