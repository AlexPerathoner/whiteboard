import { PALETTE, THICKNESS_STEPS, type Pen } from '../theme/palette'

interface Props {
  pen: Pen
  recent: string[]
  onChange: (next: Pen) => void
  onClose: () => void
}

/**
 * The popup MS shows when you click the already-selected pen a second time.
 * Layout copied from the real thing: thickness slider over a tapered track,
 * opacity slider over a checkerboard track with a numeric box, a recent-colour
 * row, then the 5x4 swatch grid, then the arrow-tip row.
 */
export function PenSettingsPopup({ pen, recent, onChange, onClose }: Props) {
  return (
    <div className="pen-popup" onPointerDown={(e) => e.stopPropagation()}>
      <label className="slider-row">
        {/* The wedge is drawn by the wrapper; the input itself is transparent
            and only supplies the thumb, so the track can taper like MS's. */}
        <span className="wedge">
          <input
            className="thickness"
            type="range"
            min={0}
            max={THICKNESS_STEPS.length - 1}
            step={1}
            value={pen.step}
            aria-label="Ink thickness"
            onChange={(e) => onChange({ ...pen, step: Number(e.target.value) })}
          />
        </span>
        <b>{pen.step + 1}</b>
      </label>

      <label className="slider-row">
        <input
          className="opacity"
          type="range"
          min={1}
          max={100}
          step={1}
          value={pen.opacity}
          aria-label="Ink opacity"
          style={{ ['--swatch' as string]: pen.color }}
          onChange={(e) => onChange({ ...pen, opacity: Number(e.target.value) })}
        />
        <input
          className="opacity-box"
          type="number"
          min={1}
          max={100}
          value={pen.opacity}
          aria-label="Ink opacity value"
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange({ ...pen, opacity: Math.min(100, Math.max(1, v)) })
          }}
        />
      </label>

      <div className="swatch-row recent">
        <button className="swatch more" title="More colors" aria-label="More colors">
          +
        </button>
        {recent.slice(0, 3).map((hex) => (
          <button
            key={hex}
            className={`swatch ${hex === pen.color ? 'on' : ''}`}
            style={{ background: hex }}
            aria-label={hex}
            onClick={() => onChange({ ...pen, color: hex })}
          />
        ))}
      </div>

      <div className="swatch-grid">
        {PALETTE.map((s) => (
          <button
            key={s.name}
            className={`swatch ${s.hex === pen.color ? 'on' : ''}`}
            style={{ background: s.hex }}
            title={s.name}
            aria-label={s.name}
            onClick={() => onChange({ ...pen, color: s.hex })}
          />
        ))}
      </div>

      {/* Arrow tips exist in MS; not wired up yet. */}
      <div className="arrow-row">
        <button className="on" title="No arrow" aria-label="No arrow">
          ⊘
        </button>
        <button disabled title="Single arrow tip — not implemented">
          ↗
        </button>
        <button disabled title="Double arrow tips — not implemented">
          ↔
        </button>
        <button className="close" onClick={onClose} title="Close" aria-label="Close">
          ✕
        </button>
      </div>
    </div>
  )
}
