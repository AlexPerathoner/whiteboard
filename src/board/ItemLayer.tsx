import { useEffect, useRef } from 'react'
import type { DomItem } from '../canvas/types'
import { worldToScreen, type Viewport } from '../canvas/viewport'

interface Props {
  items: DomItem[]
  vp: Viewport
  editingId: string | null
  selected: Set<string>
  onCommit: (id: string, text: string) => void
  /** The event is deliberately left to bubble; the stage owns selection. */
  onPointerDownItem: (id: string) => void
  onEdit: (id: string) => void
}

/** World size of an item's box, before the viewport scale is applied. */
export function itemWorldSize(item: DomItem): [number, number] | null {
  if (item.type === 'note') return [item.size, item.size]
  if (item.type === 'reaction') return [item.size, item.size]
  return null // text measures itself
}

/**
 * Text, notes and reactions live in the DOM rather than on the canvas: native
 * rendering, caret, selection and IME beat anything reimplemented on a 2D
 * context, and emoji get the platform's own font.
 *
 * Everything is positioned in *screen* coords with sizes scaled by `z`, not
 * one layer under `transform: scale(z)` -- a scaled layer rasterises once and
 * stretches the bitmap, which is blurry and hits browser layer-size limits
 * well before z=64.
 */
export function ItemLayer({
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
    // While editing, React renders `null` children for this element so that a
    // re-render cannot clobber what is being typed. That means the starting
    // text has to be seeded here.
    const item = items.find((i) => i.id === editingId)
    const start = item && item.type !== 'reaction' ? item.text : ''
    if (el.textContent !== start) el.textContent = start
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editingId, items])

  return (
    <div className="item-layer">
      {items.map((item) => {
        const [sx, sy] = worldToScreen(vp, item.x, item.y)
        const editing = editingId === item.id
        const editable = item.type !== 'reaction'
        const cls = `board-item item-${item.type} ${editing ? 'editing' : ''} ${
          selected.has(item.id) ? 'selected' : ''
        }`

        const common = {
          key: item.id,
          'data-id': item.id,
          className: cls,
          ref: editing ? editRef : undefined,
          onPointerDown: (e: React.PointerEvent) => {
            if (editing) {
              e.stopPropagation()
              return
            }
            onPointerDownItem(item.id)
          },
          onDoubleClick: (e: React.MouseEvent) => {
            if (!editable) return
            e.stopPropagation()
            onEdit(item.id)
          },
        }

        if (item.type === 'reaction') {
          return (
            <div
              {...common}
              style={{
                left: `${sx}px`,
                top: `${sy}px`,
                width: `${item.size * vp.z}px`,
                height: `${item.size * vp.z}px`,
                fontSize: `${item.size * vp.z * 0.82}px`,
              }}
            >
              {item.emoji}
            </div>
          )
        }

        if (item.type === 'note') {
          return (
            <div
              {...common}
              style={{
                left: `${sx}px`,
                top: `${sy}px`,
                width: `${item.size * vp.z}px`,
                height: `${item.size * vp.z}px`,
                background: item.color,
                fontSize: `${Math.max(8, item.size * vp.z * 0.11)}px`,
              }}
              contentEditable={editing}
              suppressContentEditableWarning
              spellCheck={false}
              onBlur={(e) => onCommit(item.id, e.currentTarget.textContent ?? '')}
              onKeyDown={(e) => {
                if (e.key === 'Escape') e.currentTarget.blur()
                e.stopPropagation()
              }}
            >
              {editing ? null : item.text}
            </div>
          )
        }

        return (
          <div
            {...common}
            style={{
              left: `${sx}px`,
              top: `${sy}px`,
              // World wrap width converted to screen. `width: max-content` is
              // what stops the containing block's remaining space from deciding
              // the wrap; `max-content` cannot go inside `min()`, since
              // intrinsic keywords are invalid in CSS math functions.
              width: 'max-content',
              maxWidth: `${item.w * vp.z}px`,
              fontSize: `${item.fontSize * vp.z}px`,
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
          >
            {editing ? null : item.text}
          </div>
        )
      })}
    </div>
  )
}
