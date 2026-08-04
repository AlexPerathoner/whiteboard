import { useEffect, useRef } from 'react'
import type { TextItem } from '../canvas/types'
import { worldToScreen, type Viewport } from '../canvas/viewport'

interface Props {
  items: TextItem[]
  vp: Viewport
  editingId: string | null
  selected: Set<string>
  onCommit: (id: string, text: string) => void
  /** The event is deliberately left to bubble; the stage owns selection. */
  onPointerDownItem: (id: string) => void
  onEdit: (id: string) => void
}

/**
 * Text lives in the DOM, not on the canvas: native rendering, selection,
 * caret and IME beat anything reimplemented on a 2D context.
 *
 * Each item is positioned in *screen* coords with `fontSize = world * z`,
 * rather than one layer under `transform: scale(z)`. A scaled layer rasterises
 * once and stretches the bitmap -- blurry, and it hits browser layer-size
 * limits long before z=64.
 */
export function TextLayer({
  items,
  vp,
  editingId,
  selected,
  onCommit,
  onPointerDownItem,
  onEdit,
}: Props) {
  const editRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editingId) return
    const el = editRef.current
    if (!el) return
    el.focus()
    // Caret to the end of any existing text.
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editingId])

  return (
    <div className="text-layer">
      {items.map((item) => {
        const [sx, sy] = worldToScreen(vp, item.x, item.y)
        const editing = editingId === item.id
        return (
          <div
            key={item.id}
            data-id={item.id}
            ref={editing ? editRef : undefined}
            className={`text-item ${editing ? 'editing' : ''} ${
              selected.has(item.id) ? 'selected' : ''
            }`}
            style={{
              left: `${sx}px`,
              top: `${sy}px`,
              fontSize: `${item.fontSize * vp.z}px`,
              // World wrap width, converted to screen. `width: max-content`
              // is what stops the containing block's remaining space from
              // deciding the wrap -- with `width: auto`, an absolutely
              // positioned box shrink-to-fits against available space, so a
              // box near the right edge rewraps as the viewport moves.
              // `max-content` cannot go inside `min()`: intrinsic keywords are
              // invalid in CSS math functions and the declaration is dropped.
              width: 'max-content',
              maxWidth: `${item.w * vp.z}px`,
              color: item.color,
            }}
            contentEditable={editing}
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={(e) => onCommit(item.id, e.currentTarget.textContent ?? '')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') e.currentTarget.blur()
              e.stopPropagation()
            }}
            onPointerDown={(e) => {
              if (editing) {
                e.stopPropagation()
                return
              }
              onPointerDownItem(item.id)
            }}
            // Double-click to re-enter a finished text box, as in MS.
            onDoubleClick={(e) => {
              e.stopPropagation()
              onEdit(item.id)
            }}
          >
            {item.text}
          </div>
        )
      })}
    </div>
  )
}
