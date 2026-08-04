import { penSize, type Pen } from '../theme/palette'
import { PenSettingsPopup } from './PenSettingsPopup'

export type Tool = 'select' | 'hand' | 'pen' | 'text'

/** Pen flyout state. The settings popup renders inside the tray, so this is
 *  a ladder, not two independent booleans. */
export type PenFlyout = 'none' | 'tray' | 'settings'

/**
 * Toolbar slots for features that are not built yet, in MS's order around the
 * text button. Rendered disabled rather than omitted, so the toolbar keeps the
 * same shape as the real app.
 */
type Placeholder = [glyph: string, label: string]
const BEFORE_TEXT: Placeholder[] = [
  ['\u{1F5D2}\uFE0F', 'Sticky note'],
  ['\u2764\uFE0F', 'Reactions'],
]
const AFTER_TEXT: Placeholder[] = [
  ['\u2B20', 'Shapes'],
  ['\u25A4', 'Templates'],
  ['\u22EF', 'More'],
]

function Placeholders({ items }: { items: Placeholder[] }) {
  return (
    <>
      {items.map(([glyph, label]) => (
        <button key={label} disabled title={`${label} — not implemented`}>
          {glyph}
        </button>
      ))}
    </>
  )
}

interface Props {
  tool: Tool
  pens: Pen[]
  penIndex: number
  penFlyout: PenFlyout
  recent: string[]
  canUndo: boolean
  canRedo: boolean
  onTool: (t: Tool) => void
  onPickPen: (i: number) => void
  onChangePen: (next: Pen) => void
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
        <Placeholders items={BEFORE_TEXT} />
        <button
          className={tool === 'text' ? 'on' : ''}
          onClick={() => props.onTool('text')}
          title="Text (T)"
        >
          T
        </button>
        <Placeholders items={AFTER_TEXT} />
      </div>
    </>
  )
}
