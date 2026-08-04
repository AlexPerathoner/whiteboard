// Captured verbatim from the live Microsoft Whiteboard pen colour picker
// (swatch <svg fill> attributes, whiteboard.cloud.microsoft, Aug 2026).
export interface Swatch {
  name: string
  hex: string
}

/** The 5x4 grid in the pen settings popup, in MS row order. */
export const PALETTE: Swatch[] = [
  { name: 'Black', hex: '#1F1F1F' },
  { name: 'Yellow', hex: '#FED430' },
  { name: 'Light orange', hex: '#FBAE17' },
  { name: 'Orange', hex: '#F36323' },

  { name: 'Red', hex: '#E71224' },
  { name: 'Dark red', hex: '#C10051' },
  { name: 'Magenta', hex: '#CF1278' },
  { name: 'Dark purple', hex: '#5B318D' },

  { name: 'Purple', hex: '#914BB8' },
  { name: 'Light blue', hex: '#3ECCFD' },
  { name: 'Blue', hex: '#0069BF' },
  { name: 'Light green', hex: '#7EC400' },

  { name: 'Green', hex: '#02A556' },
  { name: 'Light gray', hex: '#EBEBEB' },
  // 'Rainbow' and 'Galaxy' are gradient fills in MS; deferred.
]

export const BY_NAME: Record<string, string> = Object.fromEntries(
  PALETTE.map((s) => [s.name, s.hex]),
)

/**
 * MS thickness slider is 6 discrete steps (aria-valuemin 0 .. valuemax 5,
 * aria-valuetext 1..6). Widths in CSS px at 100% zoom, read straight out of
 * the SVG geometry MS renders: their ink space is 1/128 px per unit and every
 * stroke outline carries `A<r>,<r>` round joins where r = half the width.
 *
 * Measured: step 0 -> r 64 (1px), step 2 -> r 256 (4px), step 5 -> r 768 (12px).
 * Steps 1, 3 and 4 are interpolated on the "multiple of 64 units" grid those
 * three points sit on -- worth confirming before Aug 22 if it matters.
 */
export const THICKNESS_STEPS = [1, 2, 4, 6, 8, 12]

/** Highlighter is its own colour set in MS -- pure yellow, not the pen yellow. */
export const HIGHLIGHTER_YELLOW = '#FCFC00'

/**
 * MS highlighter ink is `fill="rgba(252,252,0,0.4)"` with `mix-blend-mode:
 * normal` -- straight alpha at 40%, not multiply. Measured off a real stroke.
 */
export const HIGHLIGHTER_OPACITY = 40

export interface Pen {
  color: string
  /** Index into THICKNESS_STEPS (0..5). MS shows this as 1..6. */
  step: number
  /** 1..100. */
  opacity: number
  tool: 'pen' | 'highlighter'
}

/** Width in world px for a pen, resolving the MS thickness step. */
export function penSize(pen: Pen) {
  return THICKNESS_STEPS[Math.min(THICKNESS_STEPS.length - 1, Math.max(0, pen.step))]
}

/** The tray, in MS order: three pens, then the highlighter. */
export const DEFAULT_PENS: Pen[] = [
  { color: BY_NAME['Dark purple'], step: 2, opacity: 100, tool: 'pen' },
  { color: BY_NAME['Red'], step: 2, opacity: 100, tool: 'pen' },
  { color: BY_NAME['Black'], step: 2, opacity: 100, tool: 'pen' },
  { color: HIGHLIGHTER_YELLOW, step: 4, opacity: HIGHLIGHTER_OPACITY, tool: 'highlighter' },
]
