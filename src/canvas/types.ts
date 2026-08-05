/** A spine point: streamlined position plus the pressure we derived for it. */
export type InkPoint = [x: number, y: number, pressure: number]

export type InkTool = 'pen' | 'highlighter'

export interface InkStyle {
  color: string
  /** Stroke width in world units. */
  size: number
  /** 1..100, matching the MS Whiteboard opacity slider. */
  opacity: number
  tool: InkTool
}

/**
 * Knobs that decide how the ink *feels*. Exposed live in the spike tuning
 * panel so they can be A/B'd against the real MS Whiteboard.
 */
export interface InkTuning {
  /** 0..0.95. Causal position filter. Higher = smoother but laggier. */
  streamline: number
  /** perfect-freehand outline softening. */
  smoothing: number
  /** How much pressure narrows the stroke. */
  thinning: number
  /** How many tail spine points get re-outlined per sample. */
  window: number
  /** Speed (world px per ms) that maps to minimum pressure. */
  speedToPressure: number
  /** 0..1 EMA factor on derived pressure. Higher = steadier width. */
  pressureSmoothing: number
}

/**
 * Defaults derived from Microsoft Whiteboard's own rendered geometry rather
 * than guessed. Their strokes are SVG outline fills whose vertices sit exactly
 * on the input samples, with a constant half-width and `A<r>,<r>` round joins
 * at every vertex plus round caps at both ends. For mouse input that means:
 * no velocity thinning, and no positional filtering.
 *
 * `thinning` and the pressure knobs are kept for a future stylus path, where
 * real pressure exists.
 */
export const DEFAULT_TUNING: InkTuning = {
  streamline: 0,
  // MS applies no smoothing either: its outline is an exact offset polyline
  // with true round joins, so the closest match is no outline softening.
  smoothing: 0,
  thinning: 0,
  window: 8,
  speedToPressure: 1.6,
  pressureSmoothing: 0.6,
}

export interface TextItem {
  id: string
  type: 'text'
  /** World coords of the top-left corner. */
  x: number
  y: number
  /** Font size in world units, so text scales with the canvas. */
  fontSize: number
  /**
   * Wrap width in world units. Must be world-space: a screen-space clamp would
   * rewrap the text at different words as the user zooms, which also makes the
   * item's world bounds zoom-dependent.
   */
  w: number
  color: string
  text: string
}

/**
 * A backdrop rectangle: the grids, lanes and header bands a template is made
 * of. Painted under the ink and not interactive on its own.
 */
export interface ZoneItem {
  id: string
  type: 'zone'
  x: number
  y: number
  w: number
  h: number
  fill: string
  stroke: string
}

export interface Stroke {
  id: string
  type: 'stroke'
  pts: InkPoint[]
  color: string
  size: number
  opacity: number
  tool: InkTool
  /** World-space [x0, y0, x1, y1], used for culling and hit-testing. */
  bounds: [number, number, number, number]
}
