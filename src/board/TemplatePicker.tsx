import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, TEMPLATES, type Template } from '../templates/templates'
import './templatePicker.css'

/**
 * Draws a template's own geometry as its thumbnail, rather than shipping
 * bitmaps: the layout data is already the picture.
 */
function Thumb({ t }: { t: Template }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = Math.ceil(w * dpr)
    canvas.height = Math.ceil(h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    // Source space is 1000 wide by t.h tall; fit it with a small margin.
    const k = Math.min(w / 1000, h / t.h) * 0.92
    const ox = (w - 1000 * k) / 2
    const oy = (h - t.h * k) / 2

    ctx.lineWidth = 1
    for (const [x, y, sw, sh] of t.shapes) {
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#c8c6c4'
      ctx.fillRect(ox + x * k, oy + y * k, sw * k, sh * k)
      ctx.strokeRect(ox + x * k, oy + y * k, sw * k, sh * k)
    }
    if (t.noteRect) {
      // One representative sticky, so the density of a note grid still reads.
      const [nx, ny, nw, nh] = t.noteRect
      ctx.fillStyle = '#fde68a'
      ctx.fillRect(ox + nx * k, oy + ny * k, Math.max(2, nw * k), Math.max(2, nh * k))
    }
    ctx.fillStyle = '#605e5c'
    for (const [, x, y, lw, lh] of t.labels) {
      ctx.fillRect(ox + x * k, oy + y * k, Math.max(3, lw * k), Math.max(1.5, lh * k * 0.6))
    }
  }, [t])

  return <canvas ref={ref} className="thumb" />
}

interface Props {
  onPick: (t: Template) => void
  onClose: () => void
}

export function TemplatePicker({ onPick, onClose }: Props) {
  const [category, setCategory] = useState<string>('All')
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TEMPLATES.filter(
      (t) =>
        (category === 'All' || t.category === category) &&
        (!q || t.name.toLowerCase().includes(q)),
    )
  }, [category, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="template-backdrop" onPointerDown={onClose}>
      <div
        className="template-panel"
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Template library"
      >
        <header>
          <strong>Templates</strong>
          <input
            autoFocus
            placeholder="Search templates"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={onClose} title="Close">
            ✕
          </button>
        </header>

        <div className="body">
          <nav>
            {['All', ...CATEGORIES].map((c) => (
              <button key={c} className={c === category ? 'on' : ''} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </nav>

          <div className="grid">
            {shown.map((t) => (
              <button key={t.id} className="card" onClick={() => onPick(t)} title={`Add ${t.name}`}>
                <Thumb t={t} />
                <span className="name">{t.name}</span>
                <span className="cat">{t.category}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="empty">Nothing matches “{query}”.</p>}
          </div>
        </div>

        <footer>
          {TEMPLATES.length} templates, with layouts measured from Microsoft Whiteboard.
          Starter sticky-note grids are not placed yet.
        </footer>
      </div>
    </div>
  )
}
