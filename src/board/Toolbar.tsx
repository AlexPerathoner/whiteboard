import type { ReactNode } from 'react'
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
 * Bottom dock, rebuilt against the real thing: an undo pill, a 12px gap, then
 * the tool pill. Geometry, radii, shadow and state colours are measured from
 * MS rather than guessed -- see src/theme/ms-toolbar.json.
 */
export function Toolbar(props: Props) {
  const { tool, pens, penIndex, penFlyout, recent } = props
  const pen = pens[penIndex]

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

        <div className="mini-flyout">
          <DockButton
            label={
              props.eraserMode === 'stroke'
                ? 'Eraser (E) — removes a whole stroke on contact'
                : 'Eraser (E) — rubs out only what it touches'
            }
            on={tool === 'eraser'}
            onClick={() => props.onTool('eraser')}
          >
            <span className="glyph">🧽</span>
          </DockButton>
          <div className="mini-menu wide">
            <button
              className={props.eraserMode === 'stroke' ? 'on' : ''}
              onClick={() => props.onEraserMode('stroke')}
            >
              Whole stroke
            </button>
            <button
              className={props.eraserMode === 'point' ? 'on' : ''}
              onClick={() => props.onEraserMode('point')}
            >
              Rub out
            </button>
          </div>
        </div>

        <div className="mini-flyout">
          <DockButton
            icon="note"
            label="Note (N)"
            on={tool === 'note'}
            onClick={() => props.onTool('note')}
          />
          <div className="mini-menu">
            {props.noteColors.map((c) => (
              <button
                key={c}
                className="swatch"
                style={{ background: c }}
                title={c}
                onClick={() => props.onNoteColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="mini-flyout">
          <DockButton
            icon="reaction"
            label="Reaction (R)"
            on={tool === 'reaction'}
            onClick={() => props.onTool('reaction')}
          />
          <div className="mini-menu">
            {props.reactions.map((r) => (
              <button key={r} className="emoji" onClick={() => props.onReaction(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>

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
