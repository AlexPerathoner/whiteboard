import type { EraserMode } from '../canvas/erase'
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
 * Bottom-centre toolbar, laid out like MS Whiteboard: a separate undo pill on
 * the left, then the tool pill. Buttons for features not built yet are shown
 * disabled rather than omitted, so the shape stays 1:1 and the slots are
 * obvious.
 */
export function Toolbar(props: Props) {
  const { tool, pens, penIndex, penFlyout, recent } = props
  const pen = pens[penIndex]

  return (
    <>
      <div className="undo-pill">
        <button onClick={props.onUndo} disabled={!props.canUndo} title="Undo (Ctrl+Z)">
          ↺
        </button>
        {/* MS only reveals redo once there is something to redo. */}
        {props.canRedo && (
          <button onClick={props.onRedo} title="Redo (Ctrl+Shift+Z)">
            ↻
          </button>
        )}
      </div>

      {penFlyout !== 'none' && (
        <div className="pen-tray" onPointerDown={(e) => e.stopPropagation()}>
          {pens.map((p, i) => (
            <button
              key={i}
              className={`tray-pen ${p.tool} ${penIndex === i && tool === 'pen' ? 'on' : ''}`}
              title={`${p.tool === 'highlighter' ? 'Highlighter' : 'Pen'}, thickness ${
                p.step + 1
              } (${penSize(p)}px), opacity ${p.opacity}`}
              onClick={() => props.onPickPen(i)}
            >
              <span className="nib" style={{ background: p.color }} />
            </button>
          ))}
          {/* MS puts the ruler in the pen tray, after the pens. */}
          <button
            className={`tray-icon ${props.rulerOn ? 'on' : ''}`}
            onClick={props.onToggleRuler}
            title="Ruler — ink snaps to its edge (or hold Shift while drawing)"
          >
            📐
          </button>
          <button className="tray-icon" disabled title="Lasso select — not implemented">
            ⌖
          </button>
          <button className="tray-icon" onClick={props.onCloseTray} title="Close">
            ✕
          </button>
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

      <div className="toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className={tool === 'select' ? 'on' : ''}
          onClick={() => props.onTool('select')}
          title="Select (V)"
        >
          ➤
        </button>
        <button
          className={tool === 'hand' ? 'on' : ''}
          onClick={() => props.onTool('hand')}
          title="Pan (H)"
        >
          ✋
        </button>
        <button
          className={`pen-button ${tool === 'pen' ? 'on' : ''}`}
          onClick={() => props.onTool('pen')}
          title="Pen (P) — click again for settings"
        >
          ✒️
          <span className="dot" style={{ background: pen.color }} />
        </button>
        <div className="mini-flyout">
          <button
            className={tool === 'eraser' ? 'on' : ''}
            onClick={() => props.onTool('eraser')}
            title={
              props.eraserMode === 'stroke'
                ? 'Eraser (E) — removes a whole stroke on contact'
                : 'Eraser (E) — rubs out only what it touches'
            }
          >
            🧽
          </button>
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
        {/* Note and reaction each open a small chooser, as MS does. */}
        <div className="mini-flyout">
          <button
            className={tool === 'note' ? 'on' : ''}
            onClick={() => props.onTool('note')}
            title="Note (N)"
          >
            🗒️
            <span className="dot" style={{ background: props.noteColor }} />
          </button>
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
          <button
            className={tool === 'reaction' ? 'on' : ''}
            onClick={() => props.onTool('reaction')}
            title="Reaction (R)"
          >
            {props.reaction}
          </button>
          <div className="mini-menu">
            {props.reactions.map((r) => (
              <button key={r} className="emoji" onClick={() => props.onReaction(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <button
          className={tool === 'text' ? 'on' : ''}
          onClick={() => props.onTool('text')}
          title="Text (T)"
        >
          T
        </button>
        <button disabled title="Shapes — not implemented">
          ⬠
        </button>
        <button onClick={props.onOpenTemplates} title="Templates">
          ▤
        </button>
        <button disabled title="More — not implemented">
          ⋯
        </button>
      </div>
    </>
  )
}
