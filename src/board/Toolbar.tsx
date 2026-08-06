import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { EraserMode } from '../canvas/erase'
import { MsIcon, type MS_ICONS } from '../theme/msIcons'
import { penSize, type Pen } from '../theme/palette'
import { PenSettingsPopup } from './PenSettingsPopup'

export type Tool = 'select' | 'hand' | 'pen' | 'eraser' | 'text' | 'note' | 'reaction'

/** Pen flyout state. The settings popup renders inside the tray, so this is
 *  a ladder, not two independent booleans. */
export type PenFlyout = 'none' | 'tray' | 'settings'

interface Props {
  tool: Tool
  pens: Pen[]
  penIndex: number
  penFlyout: PenFlyout
  rulerOn: boolean
  recent: string[]
  canUndo: boolean
  canRedo: boolean
  onTool: (t: Tool) => void
  onPickPen: (i: number) => void
  onChangePen: (next: Pen) => void
  onToggleRuler: () => void
  onOpenTemplates: () => void
  eraserMode: EraserMode
  onEraserMode: (m: EraserMode) => void
  noteColors: string[]
  noteColor: string
  onNoteColor: (c: string) => void
  reactions: string[]
  reaction: string
  onReaction: (r: string) => void
  onCloseTray: () => void
  onClosePopup: () => void
  onUndo: () => void
  onRedo: () => void
}

/**
 * A 40x40 hit target wrapping a 32x32 chip. MS paints hover and selection on
 * that inner chip, not on the button, which is why the structure is nested
 * rather than a single element.
 */
function DockButton({
  icon,
  label,
  on,
  disabled,
  onClick,
  children,
}: {
  icon?: keyof typeof MS_ICONS
  label: string
  on?: boolean
  disabled?: boolean
  onClick?: () => void
  children?: ReactNode
}) {
  return (
    <button
      className={`dock-btn ${on ? 'on' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="chip">
        {icon && <MsIcon name={icon} />}
        {children}
      </span>
    </button>
  )
}

/**
 * A chooser that opens on click, not hover: a menu that appears when the
 * pointer merely passes over the dock fires constantly while drawing.
 */
function MiniFlyout({
  open,
  onToggle,
  onClose,
  button,
  children,
  wide,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  button: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    // Capture phase, so the canvas cannot swallow the press first.
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open, onClose])

  return (
    <div className="mini-flyout" ref={ref}>
      <span onClick={onToggle}>{button}</span>
      {open && <div className={`mini-menu ${wide ? 'wide' : ''}`}>{children}</div>}
    </div>
  )
}

/**
 * Bottom dock, rebuilt against the real thing: an undo pill, a 12px gap, then
 * the tool pill. Geometry, radii, shadow and state colours are measured from
 * MS rather than guessed -- see src/theme/ms-toolbar.json.
 */
export function Toolbar(props: Props) {
  const { tool, pens, penIndex, penFlyout, recent } = props
  const pen = pens[penIndex]
  const [menu, setMenu] = useState<'eraser' | 'note' | 'reaction' | null>(null)
  const toggle = (m: 'eraser' | 'note' | 'reaction') => setMenu((cur) => (cur === m ? null : m))
  const close = () => setMenu(null)

  return (
    <>
      <div className="dock undo-pill">
        <DockButton
          icon="undo"
          label="Undo (Ctrl+Z)"
          disabled={!props.canUndo}
          onClick={props.onUndo}
        />
        {/* MS only reveals redo once there is something to redo. */}
        {props.canRedo && (
          <button
            className="dock-btn redo"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            onClick={props.onRedo}
          >
            <span className="chip">
              <MsIcon name="undo" />
            </span>
          </button>
        )}
      </div>

      {penFlyout !== 'none' && (
        <div className="dock pen-tray" onPointerDown={(e) => e.stopPropagation()}>
          {pens.map((p, i) => (
            <button
              key={i}
              className={`dock-btn tray-pen ${p.tool} ${
                penIndex === i && tool === 'pen' ? 'on' : ''
              }`}
              title={`${p.tool === 'highlighter' ? 'Highlighter' : 'Pen'}, thickness ${
                p.step + 1
              } (${penSize(p)}px), opacity ${p.opacity}`}
              onClick={() => props.onPickPen(i)}
            >
              <span className="chip">
                <span className="nib" style={{ background: p.color }} />
              </span>
            </button>
          ))}
          <DockButton
            label="Ruler — ink snaps to its edge (or hold Shift while drawing)"
            on={props.rulerOn}
            onClick={props.onToggleRuler}
          >
            <span className="glyph">📐</span>
          </DockButton>
          <DockButton label="Lasso select — not implemented" disabled>
            <span className="glyph">⌖</span>
          </DockButton>
          <DockButton label="Close" onClick={props.onCloseTray}>
            <span className="glyph">✕</span>
          </DockButton>
          {penFlyout === 'settings' && (
            <PenSettingsPopup
              pen={pen}
              recent={recent}
              onChange={props.onChangePen}
              onClose={props.onClosePopup}
            />
          )}
        </div>
      )}

      <div className="dock toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <DockButton
          icon="select"
          label="Select (V)"
          on={tool === 'select'}
          onClick={() => props.onTool('select')}
        />
        <DockButton
          icon="pan"
          label="Pan (H)"
          on={tool === 'hand'}
          onClick={() => props.onTool('hand')}
        />
        <DockButton
          icon="pen"
          label="Pen (P) — click again for settings"
          on={tool === 'pen'}
          onClick={() => props.onTool('pen')}
        >
          <span className="pen-dot" style={{ background: pen.color }} />
        </DockButton>

        <MiniFlyout
          wide
          open={menu === 'eraser'}
          onToggle={() => {
            props.onTool('eraser')
            toggle('eraser')
          }}
          onClose={close}
          button={
            <DockButton
              label={
                props.eraserMode === 'stroke'
                  ? 'Eraser (E) — removes a whole stroke on contact'
                  : 'Eraser (E) — rubs out only what it touches'
              }
              on={tool === 'eraser'}
            >
              <span className="glyph">🧽</span>
            </DockButton>
          }
        >
          <button
            className={props.eraserMode === 'stroke' ? 'on' : ''}
            onClick={() => {
              props.onEraserMode('stroke')
              close()
            }}
          >
            Whole stroke
          </button>
          <button
            className={props.eraserMode === 'point' ? 'on' : ''}
            onClick={() => {
              props.onEraserMode('point')
              close()
            }}
          >
            Rub out
          </button>
        </MiniFlyout>

        <MiniFlyout
          open={menu === 'note'}
          onToggle={() => {
            props.onTool('note')
            toggle('note')
          }}
          onClose={close}
          button={<DockButton icon="note" label="Note (N)" on={tool === 'note'} />}
        >
          {props.noteColors.map((c) => (
            <button
              key={c}
              className={`swatch ${c === props.noteColor ? 'on' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => {
                props.onNoteColor(c)
                close()
              }}
            />
          ))}
        </MiniFlyout>

        <MiniFlyout
          open={menu === 'reaction'}
          onToggle={() => {
            props.onTool('reaction')
            toggle('reaction')
          }}
          onClose={close}
          button={<DockButton icon="reaction" label="Reaction (R)" on={tool === 'reaction'} />}
        >
          {props.reactions.map((r) => (
            <button
              key={r}
              className={`emoji ${r === props.reaction ? 'on' : ''}`}
              onClick={() => {
                props.onReaction(r)
                close()
              }}
            >
              {r}
            </button>
          ))}
        </MiniFlyout>

        <DockButton
          icon="text"
          label="Text (T)"
          on={tool === 'text'}
          onClick={() => props.onTool('text')}
        />
        <DockButton icon="shape" label="Shapes — not implemented" disabled />
        <DockButton icon="template" label="Templates" onClick={props.onOpenTemplates} />
        <DockButton icon="more" label="More — not implemented" disabled />
      </div>
    </>
  )
}
