import { InkEngine, IDENTITY_VIEWPORT, MIN_TAIL_WINDOW, paintStroke } from '../canvas/inkEngine'
import {
  outlineFor,
  outlineStyle,
  setOutlineStyle,
  svgPathFromOutline,
} from '../canvas/strokePath'
import { DEFAULT_TUNING, type InkStyle, type InkTuning, type Stroke } from '../canvas/types'
import {
  BY_NAME,
  HIGHLIGHTER_OPACITY,
  HIGHLIGHTER_YELLOW,
  THICKNESS_STEPS,
} from '../theme/palette'
import './spike.css'

const stage = document.getElementById('stage') as HTMLDivElement
const committed = document.getElementById('committed') as HTMLCanvasElement
const panel = document.getElementById('panel') as HTMLElement
let wet = document.getElementById('wet') as HTMLCanvasElement

const tuning: InkTuning = { ...DEFAULT_TUNING }
const style: InkStyle = {
  color: BY_NAME['Dark purple'],
  size: THICKNESS_STEPS[2],
  opacity: 100,
  tool: 'pen',
}
let desynchronized = true
// MS highlighter ink is rgba(252,252,0,0.4) with mix-blend-mode: normal --
// straight alpha, not multiply. Kept toggleable only for comparison.
let highlighterBlend: 'alpha' | 'multiply' = 'alpha'

const strokes: Stroke[] = []
const pathCache = new Map<string, Path2D>()
let engine = makeEngine()

function makeEngine() {
  // Context attributes are fixed at creation, so toggling `desynchronized`
  // means swapping the element out entirely.
  const fresh = wet.cloneNode(false) as HTMLCanvasElement
  wet.replaceWith(fresh)
  wet = fresh
  const e = new InkEngine(wet, { desynchronized, highlighterBlend })
  e.setViewport(IDENTITY_VIEWPORT)
  e.setTuning(tuning)
  return e
}

function resize() {
  const dpr = window.devicePixelRatio || 1
  const w = stage.clientWidth
  const h = stage.clientHeight
  committed.width = Math.ceil(w * dpr)
  committed.height = Math.ceil(h * dpr)
  committed.style.width = `${w}px`
  committed.style.height = `${h}px`
  engine.resize(w, h, dpr)
  redrawCommitted()
}

function committedCtx() {
  const ctx = committed.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function redrawCommitted() {
  const ctx = committed.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, committed.width, committed.height)
  const c = committedCtx()
  for (const s of strokes) paintStroke(c, s, tuning, pathCache, highlighterBlend)
}

// --- pointer plumbing -------------------------------------------------------

// `?raw=0` forces the pointermove + getCoalescedEvents fallback, so the branch
// Chrome never takes can still be exercised.
const supportsRaw =
  'onpointerrawupdate' in window && new URLSearchParams(location.search).get('raw') !== '0'
let activePointer: number | null = null
// Cached at pointerdown: reading it per sample forces layout inside the
// synchronous draw path, and offsetX/offsetY are relative to the event target,
// which stops being the stage as soon as anything is layered over the canvas.
let originX = 0
let originY = 0

stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  activePointer = e.pointerId
  const r = stage.getBoundingClientRect()
  originX = r.left
  originY = r.top
  stage.setPointerCapture(e.pointerId)
  engine.begin(e.clientX - originX, e.clientY - originY, e.timeStamp, { ...style })
  refreshStats()
})

if (supportsRaw) {
  // pointerrawupdate is not rAF-throttled -- it is the whole point of this path.
  // It is already un-coalesced, so getCoalescedEvents() must NOT be used here.
  stage.addEventListener('pointerrawupdate', ((e: PointerEvent) => {
    if (activePointer !== e.pointerId) return
    engine.extend(e.clientX - originX, e.clientY - originY, e.timeStamp, 'pointerrawupdate')
  }) as EventListener)
} else {
  stage.addEventListener('pointermove', (e) => {
    if (activePointer !== e.pointerId) return
    for (const c of e.getCoalescedEvents()) {
      engine.extend(c.clientX - originX, c.clientY - originY, c.timeStamp, 'coalesced')
    }
  })
}

function finish(e: PointerEvent) {
  if (activePointer !== e.pointerId) return
  activePointer = null
  const done = engine.end()
  engine.clear()
  if (done) {
    strokes.push(done.stroke)
    paintStroke(committedCtx(), done.stroke, tuning, pathCache, highlighterBlend)
  }
  refreshStats()
}
stage.addEventListener('pointerup', finish)
stage.addEventListener('pointercancel', finish)
stage.addEventListener('contextmenu', (e) => e.preventDefault())

// --- tuning panel -----------------------------------------------------------

/** Rows that only matter on the pressure path; refreshed whenever anything moves. */
const conditionalRows: { row: HTMLElement; active: () => boolean }[] = []

function syncConditionalRows() {
  for (const { row, active } of conditionalRows) {
    const on = active()
    row.classList.toggle('inert', !on)
    const input = row.querySelector('input')
    if (input) input.disabled = !on
  }
}

function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
  activeWhen?: () => boolean,
) {
  const row = document.createElement('label')
  row.className = 'row'
  const name = document.createElement('span')
  name.textContent = label
  const out = document.createElement('b')
  out.textContent = String(get())
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(get())
  input.oninput = () => {
    set(Number(input.value))
    out.textContent = input.value
    engine.setTuning(tuning)
    syncConditionalRows()
  }
  row.append(name, input, out)
  if (activeWhen) conditionalRows.push({ row, active: activeWhen })
  return row
}

function toggle(label: string, get: () => boolean, set: (v: boolean) => void) {
  const row = document.createElement('label')
  row.className = 'row toggle'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = get()
  input.onchange = () => set(input.checked)
  const name = document.createElement('span')
  name.textContent = label
  row.append(input, name)
  return row
}

const stats = document.createElement('pre')
stats.className = 'stats'

function refreshStats() {
  const s = engine.stats
  stats.textContent = [
    `input      ${supportsRaw ? 'pointerrawupdate' : 'pointermove + coalesced'}`,
    `seen       ${s.source}`,
    `events     ${s.events}`,
    `points     ${s.points}`,
    `last       ${s.lastSampleMs.toFixed(2)} ms`,
    `worst      ${s.worstSampleMs.toFixed(2)} ms`,
    `strokes    ${strokes.length}`,
    `dpr        ${window.devicePixelRatio}`,
  ].join('\n')
}
setInterval(refreshStats, 250)

function button(label: string, onClick: () => void) {
  const b = document.createElement('button')
  b.textContent = label
  b.onclick = onClick
  return b
}

/**
 * A desynchronized 2d context is closer to a front buffer than a normal one,
 * and content persistence between presents is not guaranteed on every
 * GPU/driver combination. If this reports FAILED, the offscreen buffer path
 * has to become the only path.
 */
async function persistenceCheck(out: HTMLElement) {
  const ctx = wet.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#ff00ff'
  ctx.fillRect(4, 4, 32, 32)
  out.textContent = 'checking…'
  await new Promise((r) => setTimeout(r, 700))
  const px = ctx.getImageData(12, 12, 1, 1).data
  const ok = px[3] > 0 && px[0] > 200 && px[2] > 200
  out.textContent = ok
    ? `persistence OK (desynchronized=${desynchronized})`
    : `persistence FAILED (desynchronized=${desynchronized}) — use buffer path always`
  out.className = ok ? 'note ok' : 'note bad'
  ctx.clearRect(0, 0, wet.width, wet.height)
}

function buildPanel() {
  panel.innerHTML = ''
  const h = document.createElement('h1')
  h.textContent = 'Ink spike'
  const sub = document.createElement('p')
  sub.className = 'sub'
  sub.textContent = 'A/B against MS Whiteboard before Aug 22.'
  panel.append(h, sub)

  const pens = document.createElement('div')
  pens.className = 'pens'
  for (const [name, hex, size, opacity, tool] of [
    ['Dark purple', BY_NAME['Dark purple'], THICKNESS_STEPS[2], 100, 'pen'],
    ['Red', BY_NAME['Red'], THICKNESS_STEPS[2], 100, 'pen'],
    ['Black', BY_NAME['Black'], THICKNESS_STEPS[2], 100, 'pen'],
    ['Highlighter', HIGHLIGHTER_YELLOW, THICKNESS_STEPS[4], HIGHLIGHTER_OPACITY, 'highlighter'],
  ] as const) {
    const b = document.createElement('button')
    b.className = 'pen'
    b.style.background = hex
    b.title = `${name} — ${tool}, ${size}px, opacity ${opacity}`
    b.onclick = () => {
      style.color = hex
      style.size = size
      style.opacity = opacity
      style.tool = tool
      for (const el of pens.children) el.classList.remove('on')
      b.classList.add('on')
    }
    pens.append(b)
  }
  pens.firstElementChild?.classList.add('on')
  panel.append(pens)

  panel.append(
    slider('streamline', 0, 0.9, 0.01, () => tuning.streamline, (v) => (tuning.streamline = v)),
    slider('smoothing', 0, 1, 0.01, () => tuning.smoothing, (v) => (tuning.smoothing = v)),
    slider('thinning', 0, 0.9, 0.01, () => tuning.thinning, (v) => (tuning.thinning = v)),
    slider('window', MIN_TAIL_WINDOW, 32, 1, () => tuning.window, (v) => (tuning.window = v)),
    // Pressure only reaches the outline through `thinning`. MS uses constant
    // width for mouse, so at the default these do nothing -- grey them out
    // rather than hand over sliders that silently no-op.
    slider(
      'speed→pressure',
      0.2,
      6,
      0.1,
      () => tuning.speedToPressure,
      (v) => (tuning.speedToPressure = v),
      () => tuning.thinning > 0,
    ),
    slider(
      'pressure smooth',
      0,
      0.95,
      0.01,
      () => tuning.pressureSmoothing,
      (v) => (tuning.pressureSmoothing = v),
      () => tuning.thinning > 0,
    ),
    slider('size', 1, 24, 1, () => style.size, (v) => (style.size = v)),
    slider('opacity', 1, 100, 1, () => style.opacity, (v) => (style.opacity = v)),
  )

  panel.append(
    toggle('desynchronized', () => desynchronized, (v) => {
      desynchronized = v
      engine = makeEngine()
      resize()
    }),
    toggle('highlighter multiply', () => highlighterBlend === 'multiply', (v) => {
      highlighterBlend = v ? 'multiply' : 'alpha'
      engine = makeEngine()
      resize()
    }),
    // MS joins outline points with straight segments. The quadratic builder is
    // the perfect-freehand default and visibly rounds sharp reversals.
    toggle('quadratic outline', () => outlineStyle === 'quadratic', (v) => {
      setOutlineStyle(v ? 'quadratic' : 'straight')
      pathCache.clear()
      redrawCommitted()
    }),
  )

  const note = document.createElement('div')
  note.className = 'note'
  note.textContent = 'persistence: not checked'
  panel.append(
    button('check desync persistence', () => void persistenceCheck(note)),
    note,
    button('clear board', () => {
      strokes.length = 0
      pathCache.clear()
      redrawCommitted()
      refreshStats()
    }),
    button('stress: 2000 strokes', () => {
      for (let i = 0; i < 2000; i++) strokes.push(randomStroke())
      const t0 = performance.now()
      redrawCommitted()
      note.textContent = `2000 strokes redrawn in ${(performance.now() - t0).toFixed(0)} ms`
      refreshStats()
    }),
    stats,
  )
}

function randomStroke(): Stroke {
  const x = Math.random() * stage.clientWidth
  const y = Math.random() * stage.clientHeight
  const pts: [number, number, number][] = []
  for (let i = 0; i < 24; i++) {
    pts.push([x + Math.cos(i / 3) * i * 1.4, y + Math.sin(i / 2) * i * 1.1, 0.6])
  }
  return {
    id: crypto.randomUUID(),
    type: 'stroke',
    pts,
    color: BY_NAME['Dark purple'],
    size: 4,
    opacity: 100,
    tool: 'pen',
    bounds: [x - 40, y - 40, x + 40, y + 40],
  }
}

// Exposed so a self-crossing stroke can be driven programmatically -- a mouse
// drag can only draw straight lines, and the single-stroke overlap case is
// exactly what the buffer compositing path exists to get right.
;(window as unknown as Record<string, unknown>).__spike = {
  drawPath(pts: [number, number][], override?: Partial<InkStyle>) {
    const s = { ...style, ...override }
    engine.begin(pts[0][0], pts[0][1], performance.now(), s)
    for (let i = 1; i < pts.length; i++) engine.extend(pts[i][0], pts[i][1], performance.now() + i * 6)
    const done = engine.end()
    engine.clear()
    if (done) {
      strokes.push(done.stroke)
      paintStroke(committedCtx(), done.stroke, tuning, pathCache, highlighterBlend)
    }
    return done?.stroke ?? null
  },
  /**
   * The architecture rests on the claim that filling the tail window once per
   * sample produces the same image as filling the whole stroke in one go.
   * This renders both ways and diffs the pixels, rather than trusting it.
   */
  equivalence(pts: [number, number, number][], size = 6) {
    const W = 1200
    const H = 700
    const mk = () => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const x = c.getContext('2d', { willReadFrequently: true })!
      x.fillStyle = '#000'
      return x
    }
    const a = mk()
    const b = mk()

    a.fill(new Path2D(svgPathFromOutline(outlineFor(pts, size, tuning, true))))

    const w = Math.max(MIN_TAIL_WINDOW, tuning.window)
    for (let i = 1; i <= pts.length; i++) {
      const tail = pts.slice(Math.max(0, i - w), i)
      if (tail.length === 0) continue
      b.fill(new Path2D(svgPathFromOutline(outlineFor(tail, size, tuning, i === pts.length))))
    }

    const pa = a.getImageData(0, 0, W, H).data
    const pb = b.getImageData(0, 0, W, H).data
    let inked = 0
    let missing = 0 // in whole-stroke render but not incremental -- real gaps
    let extra = 0 // in incremental but not whole -- antialias bleed at seams
    let worstDelta = 0
    for (let i = 3; i < pa.length; i += 4) {
      const a1 = pa[i]
      const b1 = pb[i]
      if (a1 > 8) inked++
      if (a1 > 8 && b1 <= 8) missing++
      if (b1 > 8 && a1 <= 8) extra++
      const d = Math.abs(a1 - b1)
      if (d > worstDelta) worstDelta = d
    }
    return {
      inkedPx: inked,
      missingPx: missing,
      extraPx: extra,
      worstAlphaDelta: worstDelta,
      pctMissing: +((missing / inked) * 100).toFixed(3),
    }
  },
  timeRedraw() {
    const t0 = performance.now()
    redrawCommitted()
    return performance.now() - t0
  },
  strokes,
  tuning,
  style,
}

buildPanel()
syncConditionalRows()
resize()
refreshStats()
window.addEventListener('resize', resize)
