import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { EraserMode } from '../canvas/erase'
import { highlighterIcon, INK_ICONS, penIcon } from '../theme/inkIcons'
import { MsIcon, type MS_ICONS } from '../theme/msIcons'
import { NOTE_COLORS, NOTE_COLOR_ORDER, NOTE_ICONS, noteSwatch } from '../theme/noteIcons'
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

/** Raw captured markup, injected the same way the dock icons are. */
function RawIcon({ html }: { html: string }) {
  return <span className="ms-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
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
  grid,
  notes,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  button: ReactNode
  children: ReactNode
  wide?: boolean
  grid?: boolean
  notes?: boolean
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
      {open && (
        <div
          className={`mini-menu ${wide ? 'wide' : ''} ${grid ? 'grid' : ''} ${
            notes ? 'notes' : ''
          }`}
        >
          {children}
        </div>
      )}
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
                <RawIcon
                  html={p.tool === 'highlighter' ? highlighterIcon(p.color) : penIcon(p.color)}
                />
              </span>
            </button>
          ))}
          <MiniFlyout
            wide
            open={menu === 'eraser'}
            onToggle={() => {
              // Same gesture as the pens: select it first, and only a second
              // click on the already-active eraser opens its options.
              if (tool === 'eraser') toggle('eraser')
              else {
                props.onTool('eraser')
                close()
              }
            }}
            onClose={close}
            button={
              <DockButton
                label={
                  props.eraserMode === 'stroke'
                    ? 'Eraser (E) — whole stroke. Click again for options'
                    : 'Eraser (E) — rub out. Click again for options'
                }
                on={tool === 'eraser'}
              >
                <RawIcon html={INK_ICONS.eraser} />
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
          <DockButton
            label="Ruler — ink snaps to its edge (or hold Shift while drawing)"
            on={props.rulerOn}
            onClick={props.onToggleRuler}
          >
            <span className="glyph">📐</span>
          </DockButton>
          <DockButton label="Lasso select — not implemented" disabled>
            <RawIcon html={INK_ICONS.lasso} />
          </DockButton>
          <DockButton label="Exit ink mode" onClick={props.onCloseTray}>
            <RawIcon html={INK_ICONS.exit} />
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
          notes
          open={menu === 'note'}
          onToggle={() => {
            props.onTool('note')
            toggle('note')
          }}
          onClose={close}
          button={<DockButton icon="note" label="Note (N)" on={tool === 'note'} />}
        >
          {/* First column carries the two actions, as in MS. */}
          <button
            className="note-btn"
            title="Add a note with the previously selected colour"
            onClick={() => {
              props.onNoteColor(props.noteColor)
              close()
            }}
          >
            <RawIcon html={NOTE_ICONS.addNote} />
          </button>
          <button className="note-btn" disabled title="Add note grid — not implemented">
            <RawIcon html={NOTE_ICONS.grid} />
          </button>
          {NOTE_COLOR_ORDER.map((name) => {
            const hex = NOTE_COLORS[name as keyof typeof NOTE_COLORS]
            return (
              <button
                key={name}
                className={`note-btn ${hex === props.noteColor ? 'on' : ''}`}
                title={`Add ${name} note`}
                onClick={() => {
                  props.onNoteColor(hex)
                  close()
                }}
              >
                <RawIcon html={noteSwatch(hex)} />
              </button>
            )
          })}
          {/* MS closes the panel from an eighth column, which is what makes
              the panel 320 wide rather than 280. */}
          <button className="note-btn close-col" title="Close panel" onClick={close}>
            ✕
          </button>
        </MiniFlyout>

        <MiniFlyout
          grid
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
