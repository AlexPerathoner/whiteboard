import raw from './ms-previews.json'
import type { TextItem, ZoneItem } from '../canvas/types'

/**
 * Templates, built from geometry read out of the real MS Whiteboard preview
 * panel rather than reconstructed. See ms-previews.json for provenance.
 *
 * Coordinates in the source are normalised to a 1000-wide box, so a template
 * can be dropped onto the canvas at any size.
 */
export interface Template {
  id: string
  name: string
  category: string
  /** Shape rects, normalised: [x, y, w, h] in a 1000-wide space. */
  shapes: [number, number, number, number][]
  /** Short structural labels: [text, x, y, w, h]. */
  labels: [string, number, number, number, number][]
  /** Starter sticky grid: how many, and the first one's rect. */
  noteCount: number
  noteRect: [number, number, number, number] | null
  /** Height in the same normalised units. */
  h: number
}

interface RawTemplate {
  h: number
  s: number[][]
  nCount: number
  n0: number[] | null
  t: (string | number)[][]
}

/** Category per template, from the picker's own navigation. */
const CATEGORY: Record<string, string> = {
  'Affinity diagram': 'Brainstorming',
  Brainstorm: 'Brainstorming',
  Moodboard: 'Brainstorming',
  'Topic Brainstorm': 'Brainstorming',
  'Empathy map': 'Design and research',
  'Feedback grid': 'Design and research',
  'Kano model': 'Design and research',
  'Simple journey map': 'Design and research',
  Storyboarding: 'Design and research',
  'User Interviews': 'Design and research',
  'Assumption grid': 'Problem solving',
  'Cost/benefit analysis': 'Problem solving',
  'Importance/feasibility analysis': 'Problem solving',
  'Feature goals': 'Strategy',
  'Goal setting': 'Strategy',
  'Pros and cons': 'Strategy',
  SMART: 'Strategy',
  'SWOT analysis': 'Strategy',
  'Success Metrics': 'Strategy',
  'Daily stand-up': 'Project planning',
  'Jobs to be done': 'Project planning',
}

/**
 * The preview panel labels each template with its category names as a
 * breadcrumb. Those are chrome around the preview, not part of the layout, so
 * they must not be planted on the board.
 */
const MS_CATEGORY_NAMES = new Set([
  'Brainstorming',
  'Design and research',
  'Problem solving',
  'Project planning',
  'Strategy',
  'Retrospective',
  'Games',
  'Workshops',
  'Learning',
  'Recommended',
])

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const TEMPLATES: Template[] = Object.entries(
  (raw as { templates: Record<string, RawTemplate> }).templates,
).map(([name, t]) => ({
  id: slug(name),
  name,
  category: CATEGORY[name] ?? 'Other',
  h: t.h,
  shapes: t.s as [number, number, number, number][],
  labels: (t.t as [string, number, number, number, number][]).filter(
    (l) => !MS_CATEGORY_NAMES.has(l[0]),
  ),
  noteCount: t.nCount,
  noteRect: (t.n0 as [number, number, number, number] | null) ?? null,
}))

export const CATEGORIES = [...new Set(TEMPLATES.map((t) => t.category))].sort()

/** Width in world units a template occupies when inserted. */
export const TEMPLATE_WIDTH = 1600

/**
 * Turns a template into board items, positioned so its top-left lands on
 * (x, y). Labels become text; zones become non-interactive backdrop shapes.
 *
 * The starter sticky grids are deliberately not materialised yet: notes are
 * their own item type and are not built. `noteCount` records what is missing.
 */
export function instantiate(
  t: Template,
  x: number,
  y: number,
  width = TEMPLATE_WIDTH,
): { zones: ZoneItem[]; texts: TextItem[] } {
  const k = width / 1000
  const zones: ZoneItem[] = t.shapes.map((r, i) => ({
    id: crypto.randomUUID(),
    type: 'zone',
    x: x + r[0] * k,
    y: y + r[1] * k,
    w: r[2] * k,
    h: r[3] * k,
    // Alternating tint would misrepresent MS; a single neutral backdrop keeps
    // the structure legible without inventing their palette.
    fill: i === 0 ? '#f3f2f1' : '#ffffff',
    stroke: '#d1d1d1',
  }))

  const texts: TextItem[] = t.labels.map((l) => ({
    id: crypto.randomUUID(),
    type: 'text',
    x: x + l[1] * k,
    y: y + l[2] * k,
    // Label heights in the capture are the text box, not the glyph size; the
    // width/height ratio is unreliable at this scale, so derive size from the
    // box height with a floor that stays readable.
    fontSize: Math.max(14, Math.round(l[4] * k * 1.1)),
    w: Math.max(80, l[3] * k * 1.6),
    color: '#1F1F1F',
    text: l[0],
  }))

  return { zones, texts }
}
