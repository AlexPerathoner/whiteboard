import { useCallback, useEffect, useRef, useState } from 'react'
import { History } from '../canvas/history'
import { InkEngine } from '../canvas/inkEngine'
import { splitStroke, touches, type EraserMode } from '../canvas/erase'
import { OverlayLayer, type Rect } from '../canvas/overlay'
import {
  clampRuler,
  defaultRuler,
  grabAt,
  sideFor,
  snapToRuler,
  type RulerGrab,
  type RulerSide,
  type RulerState,
} from '../canvas/ruler'
import { CommittedLayer } from '../canvas/renderer'
import {
  DEFAULT_TUNING,
  type DomItem,
  type InkStyle,
  type Stroke,
  type TextItem,
} from '../canvas/types'
import {
  boundsIntersect,
  clampZoom,
  normRect,
  screenToWorld,
  unionRects,
  zoomAt,
  type Viewport,
} from '../canvas/viewport'
import { DEFAULT_PENS, penSize, type Pen } from '../theme/palette'
import { api, EMPTY_DOC, type BoardDoc } from '../api'
import { navigate } from '../router'
import { MsIcon } from '../theme/msIcons'
import { instantiate, TEMPLATE_WIDTH, type Template } from '../templates/templates'
import { TemplatePicker } from './TemplatePicker'
import { ItemLayer } from './ItemLayer'
import { renderThumbnail } from './thumbnail'
import { Toolbar, type PenFlyout, type Tool } from './Toolbar'
import './board.css'

/** Quiet period after the last edit before the board is written back. */
const AUTOSAVE_MS = 1500

/** Default text size in world units, matching MS's default text block. */
const DEFAULT_FONT_SIZE = 24
/** Default wrap width in world units. */
const DEFAULT_TEXT_WIDTH = 480
/** Notes are square in MS; this is one side, in world units. */
const NOTE_SIZE = 200
const REACTION_SIZE = 64
/** MS's note colours. */
const NOTE_COLORS = ['#FEF7A8', '#FBD3A5', '#F9B8C0', '#C8E6C9', '#B8DCF5', '#D9C7F0', '#E8E8E8']
const REACTIONS = ['👍', '❤️', '😀', '🎉', '😮', '😢', '🔥', '⭐']
/** Pens whose colours seed the "recent" row in the settings popup. */
const RECENT_SLOTS = DEFAULT_PENS.slice(0, 3)

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  p: 'pen',
  e: 'eraser',
  t: 'text',
  n: 'note',
  r: 'reaction',
}

function penStyle(pen: Pen): InkStyle {
  return { color: pen.color, size: penSize(pen), opacity: pen.opacity, tool: pen.tool }
}

type Drag =
  | { kind: 'ink' }
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'marquee'; start: [number, number]; rect: Rect }
  | { kind: 'erase'; before: Stroke[] }
  | { kind: 'ruler'; grab: Exclude<RulerGrab, null>; last: [number, number] }
  | {
      kind: 'move'
      startWorld: [number, number]
      lastWorld: [number, number]
      /** False until the pointer has travelled past MOVE_THRESHOLD_PX. */
      active: boolean
    }
  | null

const supportsRaw = 'onpointerrawupdate' in window

/**
 * A click that selects must not also commit a move. Without this, cursor
 * jitter during a shift-click turns into a 1px move on the undo stack.
 */
const MOVE_THRESHOLD_PX = 3

/** Radius of the stroke eraser, in screen pixels. */
const ERASER_RADIUS_PX = 12

/** Capture is an optimisation for drags, not a requirement; it throws if the
 *  pointer has already been released. */
function capturePointer(el: HTMLElement, pointerId: number) {
  try {
    el.setPointerCapture(pointerId)
  } catch {
    /* ignore */
  }
}

export function Board({ boardId }: { boardId: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const committedRef = useRef<HTMLCanvasElement>(null)
  const wetRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  const layer = useRef<CommittedLayer | null>(null)
  const engine = useRef<InkEngine | null>(null)
  const overlay = useRef<OverlayLayer | null>(null)
  const selection = useRef<Set<string>>(new Set())
  const vp = useRef<Viewport>({ x: 0, y: 0, z: 1 })
  const drag = useRef<Drag>(null)
  const activePointer = useRef<number | null>(null)
  const origin = useRef<[number, number]>([0, 0])
  const spaceHeld = useRef(false)

  const [tool, setToolState] = useState<Tool>('pen')
  const [pens, setPens] = useState<Pen[]>(DEFAULT_PENS)
  const [penIndex, setPenIndex] = useState(0)
  // One enum, not two booleans: the popup renders inside the tray, so
  // `popup && !tray` is unrepresentable on screen and must not be in state.
  const [penFlyout, setPenFlyout] = useState<PenFlyout>('none')
  // Ruler lives in screen space and is deliberately not part of the document:
  // it is a tool you position, not content you save.
  const ruler = useRef<RulerState | null>(null)
  const [rulerOn, setRulerOn] = useState(false)
  /** Edge chosen at stroke start; see snapToRuler on why it must not float. */
  const rulerSide = useRef<RulerSide>(1)
  const [recent, setRecent] = useState<string[]>(RECENT_SLOTS.map((p) => p.color))
  const [zoomLabel, setZoomLabel] = useState(100)
  const [items, setItems] = useState<DomItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** Template armed for placement; follows the cursor until a click. */
  const placing = useRef<Template | null>(null)
  const ghostAt = useRef<[number, number] | null>(null)
  const [placingName, setPlacingName] = useState<string | null>(null)
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0])
  const [reaction, setReaction] = useState(REACTIONS[0])
  const [eraserMode, setEraserMode] = useState<EraserMode>('stroke')
  // Selection is a ref so the pointer handlers can mutate it and redraw the
  // overlay synchronously; this forces the render that lets the text layer
  // show its selected state.
  const [, setSelectionTick] = useState(0)
  // Text lives in the DOM and is positioned from the viewport, so it needs a
  // render when the camera moves. Skipped entirely when there is no text.
  const [, setVpTick] = useState(0)
  const itemsRef = useRef<DomItem[]>(items)
  itemsRef.current = items
  /** Set by the text layer when a text element takes the pointerdown. */
  const pendingTextHit = useRef<string | null>(null)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const dirty = useRef(false)
  const saveTimer = useRef<number | null>(null)

  const save = useCallback(async () => {
    if (!dirty.current) return
    dirty.current = false
    setSaveState('saving')
    const doc: BoardDoc = {
      version: 1,
      strokes: layer.current!.strokes,
      items: itemsRef.current,
      zones: layer.current!.zones,
    }
    try {
      await api.putDoc(boardId, doc)
      const png = await renderThumbnail(doc.strokes, doc.texts, doc.zones)
      if (png) await api.putThumb(boardId, png)
      setSaveState('idle')
    } catch (err) {
      // Keep the board dirty so the next edit -- or leaving the page -- retries.
      dirty.current = true
      setSaveState('error')
      console.error('autosave failed', err)
    }
  }, [boardId])

  const markDirty = useCallback(() => {
    dirty.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(save, AUTOSAVE_MS)
  }, [save])
  const history = useRef<History | null>(null)
  if (!history.current) {
    // Every mutation goes through the undo stack, so its change callback is
    // also the single place that knows the document needs writing back.
    history.current = new History(200, () => {
      const h = history.current!
      setHistoryState({ canUndo: h.canUndo, canRedo: h.canRedo })
      markDirty()
    })
  }

  /** Marks the selection ref as changed so views depending on it re-render. */
  const bumpSelection = useCallback(() => setSelectionTick((n) => n + 1), [])

  /**
   * World bounds of a text item.
   *
   * The rendered element is the only thing that knows the real wrapped size,
   * but reading it is a forced synchronous layout -- and this runs once per
   * selected item per pointer sample while dragging. So the measured *size* is
   * cached: it is zoom-invariant by construction (see TextLayer) and only
   * changes when the text itself does, which `textSizes.current.delete` covers.
   */
  const textSizes = useRef(new Map<string, [number, number]>())
  const itemBounds = useCallback((item: DomItem): Rect => {
    // Notes and reactions carry their own size; only text has to be measured.
    if (item.type !== 'text') {
      return [item.x, item.y, item.x + item.size, item.y + item.size]
    }
    let size = textSizes.current.get(item.id)
    if (!size) {
      const el = stageRef.current?.querySelector<HTMLElement>(`.board-item[data-id="${item.id}"]`)
      if (!el) {
        // Before first paint: rough estimate, deliberately not cached.
        const w = Math.max(1, item.text.length) * item.fontSize * 0.55
        return [item.x, item.y, item.x + w, item.y + item.fontSize * 1.3]
      }
      const r = el.getBoundingClientRect()
      const z = vp.current.z
      size = [r.width / z, r.height / z]
      textSizes.current.set(item.id, size)
    }
    return [item.x, item.y, item.x + size[0], item.y + size[1]]
  }, [])

  /** World bounds of the current selection, or null when nothing is selected. */
  const selectionBounds = useCallback((): Rect | null => {
    const l = layer.current
    if (!l || selection.current.size === 0) return null
    return unionRects([
      ...l.strokes.filter((s) => selection.current.has(s.id)).map((s) => s.bounds),
      ...itemsRef.current.filter((t) => selection.current.has(t.id)).map(itemBounds),
    ])
  }, [itemBounds])

  const drawOverlay = useCallback(
    (marquee: Rect | null = null, eraser: [number, number] | null = null) => {
      const t = placing.current
      const at = ghostAt.current
      const w = TEMPLATE_WIDTH * vp.current.z
      overlay.current?.draw(
        vp.current,
        selectionBounds(),
        marquee,
        eraser,
        ERASER_RADIUS_PX,
        ruler.current,
        t && at
          ? { rects: t.shapes, x: at[0] - w / 2, y: at[1] - (t.h / 1000) * w / 2, w, h: (t.h / 1000) * w }
          : null,
      )
    },
    [selectionBounds],
  )


  /** The only way to change tool: leaving the pen always closes its flyouts. */
  const setTool = (t: Tool) => {
    setToolState(t)
    if (t !== 'pen') setPenFlyout('none')
  }

  /** MS: picking the pen tool opens the tray; picking it again toggles it. */
  const onPenTool = () => {
    if (tool === 'pen') setPenFlyout((f) => (f === 'none' ? 'tray' : 'none'))
    else {
      setToolState('pen')
      setPenFlyout('tray')
    }
  }

  const toggleRuler = () => {
    const stage = stageRef.current!
    ruler.current = ruler.current
      ? null
      : defaultRuler(stage.clientWidth, stage.clientHeight)
    setRulerOn(!!ruler.current)
    setPenFlyout('none')
    setToolState('pen')
    drawOverlay()
  }

  /** MS: clicking the already-selected slot opens its settings. */
  const onPickPen = (i: number) => {
    if (i === penIndex && tool === 'pen') {
      setPenFlyout((f) => (f === 'settings' ? 'tray' : 'settings'))
    } else {
      setPenIndex(i)
      setPenFlyout('tray')
      setToolState('pen')
    }
  }

  // --- commands ------------------------------------------------------------

  const commitStroke = useCallback((stroke: Stroke, path: Path2D) => {
    const l = layer.current!
    history.current!.push({
      label: 'draw',
      do: () => l.append(stroke, path),
      undo: () => l.remove(new Set([stroke.id])),
    })
  }, [])

  /** Moves everything in the selection -- strokes on the canvas, text in the DOM. */
  const translateSelection = useCallback((ids: Set<string>, dx: number, dy: number) => {
    layer.current!.translate(ids, dx, dy)
    if (itemsRef.current.some((t) => ids.has(t.id))) {
      setItems((list) =>
        list.map((t) => (ids.has(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t)),
      )
    }
  }, [])

  /**
   * Stroke eraser, as MS does by default: touching any part of a stroke
   * removes the whole thing rather than cutting a hole in it.
   */
  const eraseAt = useCallback(
    (wx: number, wy: number, mode: EraserMode) => {
      const l = layer.current!
      const r = ERASER_RADIUS_PX / vp.current.z
      const probe: Rect = [wx - r, wy - r, wx + r, wy + r]
      let changed = false
      const next: Stroke[] = []
      for (const s of l.strokes) {
        const near =
          s.bounds[0] <= probe[2] &&
          s.bounds[2] >= probe[0] &&
          s.bounds[1] <= probe[3] &&
          s.bounds[3] >= probe[1]
        if (!near || !touches(s, wx, wy, r)) {
          next.push(s)
          continue
        }
        changed = true
        // Stroke mode drops the whole thing; point mode keeps what the disc
        // did not cover, which can leave two pieces where it cut through.
        if (mode === 'point') next.push(...splitStroke(s, wx, wy, r))
      }
      if (changed) l.setStrokes(next)
    },
    [],
  )

  const deleteSelection = useCallback(() => {
    const l = layer.current!
    const ids = new Set(selection.current)
    if (ids.size === 0) return
    // Captured before removal so undo can put them back at their old depth.
    const entries = l.strokes
      .map((stroke, index) => ({ stroke, index }))
      .filter((e) => ids.has(e.stroke.id))
    const textEntries = itemsRef.current
      .map((item, index) => ({ item, index }))
      .filter((e) => ids.has(e.item.id))
    if (entries.length === 0 && textEntries.length === 0) return
    history.current!.push({
      label: 'delete',
      do: () => {
        l.remove(ids)
        if (textEntries.length) setItems((list) => list.filter((t) => !ids.has(t.id)))
      },
      undo: () => {
        l.insertAt(entries)
        if (textEntries.length)
          setItems((list) => {
            const next = [...list]
            for (const { item, index } of textEntries) {
              next.splice(Math.min(index, next.length), 0, item)
            }
            return next
          })
      },
    })
    selection.current = new Set()
    bumpSelection()
    drawOverlay()
  }, [bumpSelection, drawOverlay])

  /**
   * Drops a template into the middle of the current view as one undoable
   * command -- backdrop zones plus their labels together.
   */
  /** Arms placement: the ghost follows the cursor until a click drops it. */
  const armTemplate = useCallback((t: Template) => {
    setPickerOpen(false)
    placing.current = t
    ghostAt.current = null
    setPlacingName(t.name)
  }, [])

  const cancelPlacing = useCallback(() => {
    placing.current = null
    ghostAt.current = null
    setPlacingName(null)
    drawOverlay()
  }, [drawOverlay])

  const dropTemplate = useCallback(
    (t: Template, centreX: number, centreY: number) => {
      const l = layer.current!
      const width = TEMPLATE_WIDTH
      const height = (t.h / 1000) * width
      const { zones, texts } = instantiate(t, centreX - width / 2, centreY - height / 2, width)
      const ids = new Set(zones.map((z) => z.id))
      history.current!.push({
        label: `template ${t.name}`,
        do: () => {
          l.setZones([...l.zones, ...zones])
          setItems((list) => [...list, ...texts])
        },
        undo: () => {
          l.setZones(l.zones.filter((z) => !ids.has(z.id)))
          const textIds = new Set(texts.map((x) => x.id))
          setItems((list) => list.filter((x) => !textIds.has(x.id)))
        },
      })
      cancelPlacing()
    },
    [cancelPlacing],
  )

  /** Blur of a text box: create, update or discard. */
  const commitText = useCallback(
    (id: string, text: string) => {
      setEditingId(null)
      textSizes.current.delete(id)
      const existing = itemsRef.current.find((t) => t.id === id)
      // Reactions carry no text, so nothing to commit.
      if (!existing || existing.type === 'reaction') return
      const trimmed = text.trim()

      // An empty *text* box that was never typed into is not worth an undo
      // entry. A note is a real object even when blank, so it stays.
      if (existing.type === 'text' && existing.text === '' && trimmed === '') {
        setItems((list) => list.filter((t) => t.id !== id))
        return
      }
      if (existing.text === trimmed) return

      const before = existing.text
      const apply = (value: string) =>
        setItems((list) => list.map((t) => (t.id === id ? { ...t, text: value } : t)))

      if (existing.type === 'text' && before === '') {
        // First commit of a new box: undo removes it entirely.
        const created = { ...existing, text: trimmed }
        history.current!.push({
          label: 'add text',
          // Insert-or-replace: on first run the empty box is still in the list,
          // but after an undo removed it, redo has to put it back.
          do: () =>
            setItems((list) =>
              list.some((t) => t.id === id)
                ? list.map((t) => (t.id === id ? created : t))
                : [...list, created],
            ),
          undo: () => setItems((list) => list.filter((t) => t.id !== id)),
        })
        return
      }
      history.current!.push({
        label: 'edit text',
        do: () => apply(trimmed),
        undo: () => apply(before),
      })
    },
    [],
  )

  const onChangePen = (next: Pen) => {
    setPens((list) => list.map((item, i) => (i === penIndex ? next : item)))
    setRecent((r) => (r[0] === next.color ? r : [next.color, ...r.filter((c) => c !== next.color)]))
  }

  const syncViewport = useCallback(() => {
    const l = layer.current
    const e = engine.current
    if (!l || !e) return
    l.vp = vp.current
    e.setViewport(vp.current)
    l.invalidate()
    drawOverlay()
    setZoomLabel(Math.round(vp.current.z * 100))
    if (itemsRef.current.length) setVpTick((n) => n + 1)
  }, [drawOverlay])

  // --- setup ---------------------------------------------------------------

  useEffect(() => {
    const stage = stageRef.current!
    const committed = committedRef.current!
    const wet = wetRef.current!
    layer.current = new CommittedLayer(committed, DEFAULT_TUNING)
    engine.current = new InkEngine(wet, { desynchronized: true })
    overlay.current = new OverlayLayer(overlayRef.current!)
    layer.current.vp = vp.current
    engine.current.setViewport(vp.current)
    engine.current.setTuning(DEFAULT_TUNING)

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = stage.clientWidth
      const h = stage.clientHeight
      const r = stage.getBoundingClientRect()
      origin.current = [r.left, r.top]
      layer.current!.resize(w, h, dpr)
      engine.current!.resize(w, h, dpr)
      overlay.current!.resize(w, h, dpr)
      if (ruler.current) ruler.current = clampRuler(ruler.current, w, h)
      drawOverlay()
    }
    resize()

    // Dev handle: lets the canvas core be exercised (culling, zoom extremes,
    // redraw timing) without synthesising hundreds of pointer events.
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__board = {
        get vp() {
          return vp.current
        },
        layer: () => layer.current,
        setViewport: (next: Viewport) => {
          vp.current = next
          syncViewport()
        },
        addStrokes: (list: Stroke[]) => {
          layer.current!.setStrokes([...layer.current!.strokes, ...list])
        },
        selection: () => [...selection.current],
        engine: () => engine.current,
        drag: () => drag.current,
        history: () => history.current,
        hitTest: (wx: number, wy: number, tol = 6) => layer.current!.hitTest(wx, wy, tol),
      }
    }

    const ro = new ResizeObserver(resize)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [syncViewport])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Shift straightens the run being drawn -- MS's "ruler on" shortcut.
      if (e.key === 'Shift' && drag.current?.kind === 'ink') {
        engine.current?.setLineConstraint(true)
      }
      const el = e.target as HTMLElement | null
      // Checked before the space handling: a space typed into a text box is a
      // space, not the pan modifier.
      if (el && (el.tagName === 'INPUT' || el.isContentEditable)) return
      if (e.code === 'Space' && !e.repeat) spaceHeld.current = true

      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase()
        if (k === 'z') {
          e.preventDefault()
          if (e.shiftKey) history.current!.redo()
          else history.current!.undo()
          drawOverlay()
        }
        if (k === 'a') {
          e.preventDefault()
          selection.current = new Set([
            ...layer.current!.strokes.map((s) => s.id),
            ...itemsRef.current.map((t) => t.id),
          ])
          bumpSelection()
          // setTool, not setToolState -- this also dismisses the pen flyouts,
          // which would otherwise sit over the new selection.
          setTool('select')
          drawOverlay()
        }
        return
      }
      if (e.altKey) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelection()
      }
      if (e.key === 'Escape' && placing.current) {
        cancelPlacing()
        return
      }
      if (e.key === 'Escape') {
        selection.current = new Set()
        bumpSelection()
        drawOverlay()
      }
      const tk = TOOL_KEYS[e.key.toLowerCase()]
      if (tk) setTool(tk)
      // Ctrl+W,1..6 is the MS binding; plain digits pick a tray slot here
      // because Ctrl+W closes the tab in a browser.
      const n = Number(e.key)
      if (n >= 1 && n <= DEFAULT_PENS.length) {
        setPenIndex(n - 1)
        setToolState('pen')
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false
      if (e.key === 'Shift') engine.current?.setLineConstraint(false)
    }
    // Losing the window mid-press means the keyup never arrives, which would
    // leave every later click behaving as a pan.
    const release = () => {
      spaceHeld.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', release)
    }
  }, [deleteSelection, drawOverlay])

  // --- persistence ---------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    api
      .getDoc(boardId)
      .catch(() => EMPTY_DOC)
      .then((doc) => {
        if (cancelled) return
        layer.current!.setStrokes(doc.strokes ?? [])
        layer.current!.setZones(doc.zones ?? [])
        setItems(doc.texts ?? [])
        // Loading is not an edit, and the freshly loaded state is not undoable.
        history.current!.clear()
        dirty.current = false
      })
    return () => {
      cancelled = true
    }
  }, [boardId])

  useEffect(() => {
    // Closing the tab mid-debounce would otherwise drop the last edits.
    const flush = () => {
      if (!dirty.current) return
      const doc: BoardDoc = {
        version: 1,
        strokes: layer.current!.strokes,
        items: itemsRef.current,
        zones: layer.current!.zones,
      }
      navigator.sendBeacon(
        `/api/boards/${boardId}/doc`,
        new Blob([JSON.stringify(doc)], { type: 'application/json' }),
      )
    }
    addEventListener('pagehide', flush)
    return () => {
      removeEventListener('pagehide', flush)
      flush()
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [boardId])

  // --- pointer -------------------------------------------------------------

  const onPointerDown = (e: React.PointerEvent) => {
    const stage = stageRef.current!
    const [ox, oy] = origin.current
    activePointer.current = e.pointerId

    // Middle button, right button, held space and the hand tool all pan --
    // matching MS, where every one of those is a valid way to move the canvas.
    const wantsPan = e.button === 1 || e.button === 2 || spaceHeld.current || tool === 'hand'
    if (wantsPan) {
      drag.current = { kind: 'pan', lastX: e.clientX, lastY: e.clientY }
      capturePointer(stage, e.pointerId)
      return
    }
    // A press on the canvas dismisses the pen flyouts, as in MS.
    setPenFlyout('none')
    if (e.button !== 0) return

    const [wx, wy] = screenToWorld(vp.current, e.clientX - ox, e.clientY - oy)

    // Set by the text layer just before this bubbled up. Read once and cleared
    // here so it can never leak into a later press.
    const textHit = pendingTextHit.current
    pendingTextHit.current = null

    if (ruler.current) {
      const grab = grabAt(ruler.current, e.clientX - ox, e.clientY - oy)
      if (grab) {
        capturePointer(stage, e.pointerId)
        drag.current = { kind: 'ruler', grab, last: [e.clientX - ox, e.clientY - oy] }
        return
      }
    }

    if (tool === 'eraser') {
      capturePointer(stage, e.pointerId)
      // Snapshot rather than per-stroke bookkeeping: a point-erase drag can
      // rewrite the same stroke repeatedly, so one before/after pair is both
      // simpler and exactly right.
      drag.current = { kind: 'erase', before: [...layer.current!.strokes] }
      eraseAt(wx, wy, eraserMode)
      drawOverlay(null, [e.clientX - ox, e.clientY - oy])
      return
    }

    if (placing.current) {
      e.preventDefault()
      dropTemplate(placing.current, wx, wy)
      return
    }

    if (tool === 'note' || tool === 'reaction') {
      e.preventDefault()
      const base = { id: crypto.randomUUID(), x: wx, y: wy }
      const item: DomItem =
        tool === 'note'
          ? { ...base, type: 'note', size: NOTE_SIZE, color: noteColor, text: '' }
          : { ...base, type: 'reaction', size: REACTION_SIZE, emoji: reaction }
      history.current!.push({
        label: tool,
        // Insert-or-replace, so redo can put it back after an undo removed it.
        do: () => setItems((l) => (l.some((i) => i.id === item.id) ? l : [...l, item])),
        undo: () => setItems((l) => l.filter((i) => i.id !== item.id)),
      })
      // A fresh note opens for typing; a reaction is just placed.
      if (tool === 'note') setEditingId(item.id)
      return
    }

    if (tool === 'text') {
      // Placing text is a click, not a drag: taking pointer capture here would
      // retarget the follow-up mouse events to the stage, and the default
      // mousedown action then moves focus away from the box we are about to
      // create. Suppress it instead.
      e.preventDefault()
      // Clicking existing text with the text tool edits it rather than
      // stacking a fresh box on top of it.
      const existingId = textHit
      if (existingId) {
        setEditingId(existingId)
        return
      }
      const item: TextItem = {
        id: crypto.randomUUID(),
        type: 'text',
        x: wx,
        y: wy,
        fontSize: DEFAULT_FONT_SIZE,
        w: DEFAULT_TEXT_WIDTH,
        // Text inherits the active pen colour. MS gives text its own colour
        // set; that is a deliberate simplification, not an oversight.
        color: pens[penIndex].color,
        text: '',
      }
      setItems((list) => [...list, item])
      setEditingId(item.id)
      return
    }

    if (tool === 'select') {
      const l = layer.current!
      // A text element under the pointer claims the hit before any stroke,
      // since text sits above the canvas.
      // Tolerance in world units, so a 1px stroke stays clickable at any zoom.
      const hit = textHit ? { id: textHit } : l.hitTest(wx, wy, 6 / vp.current.z)
      if (hit) {
        if (e.shiftKey) selection.current.add(hit.id)
        else if (!selection.current.has(hit.id)) selection.current = new Set([hit.id])
        capturePointer(stage, e.pointerId)
        drag.current = {
          kind: 'move',
          startWorld: [wx, wy],
          lastWorld: [wx, wy],
          active: false,
        }
      } else {
        if (!e.shiftKey) selection.current = new Set()
        capturePointer(stage, e.pointerId)
        drag.current = { kind: 'marquee', start: [wx, wy], rect: [wx, wy, wx, wy] }
      }
      bumpSelection()
      drawOverlay(drag.current.kind === 'marquee' ? drag.current.rect : null)
      return
    }

    if (tool !== 'pen') return
    capturePointer(stage, e.pointerId)
    drag.current = { kind: 'ink' }
    if (ruler.current) rulerSide.current = sideFor(ruler.current, e.clientX - ox, e.clientY - oy)
    const [ix, iy] = inkPoint(e.clientX - ox, e.clientY - oy)
    engine.current!.begin(ix, iy, e.timeStamp, penStyle(pens[penIndex]))
  }

  /**
   * Screen point -> world, snapped to the ruler's edge when one is out and the
   * pointer is close enough to it.
   */
  const inkPoint = useCallback((sx: number, sy: number): [number, number] => {
    const snapped = ruler.current
      ? snapToRuler(ruler.current, sx, sy, rulerSide.current)
      : null
    return screenToWorld(vp.current, snapped ? snapped[0] : sx, snapped ? snapped[1] : sy)
  }, [])

  const extend = useCallback(
    (clientX: number, clientY: number, time: number, src: string) => {
      const [ox, oy] = origin.current
      const [wx, wy] = inkPoint(clientX - ox, clientY - oy)
      engine.current!.extend(wx, wy, time, src)
    },
    [inkPoint],
  )

  useEffect(() => {
    const stage = stageRef.current!
    if (!supportsRaw) return
    // Not rAF-throttled, and already un-coalesced -- getCoalescedEvents() must
    // not also be used, or every sample is counted twice.
    const onRaw = (ev: Event) => {
      const e = ev as PointerEvent
      if (activePointer.current !== e.pointerId || drag.current?.kind !== 'ink') return
      extend(e.clientX, e.clientY, e.timeStamp, 'pointerrawupdate')
    }
    stage.addEventListener('pointerrawupdate', onRaw)
    return () => stage.removeEventListener('pointerrawupdate', onRaw)
  }, [extend])

  const onPointerMove = (e: React.PointerEvent) => {
    // The eraser has no visible cursor of its own, so its ring has to follow
    // the pointer whenever the tool is armed -- not just while erasing.
    if (tool === 'eraser' && !drag.current) {
      const [ox, oy] = origin.current
      drawOverlay(null, [e.clientX - ox, e.clientY - oy])
      return
    }
    if (placing.current) {
      const [ox, oy] = origin.current
      ghostAt.current = [e.clientX - ox, e.clientY - oy]
      drawOverlay()
      return
    }
    if (activePointer.current !== e.pointerId) return
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      const dx = e.clientX - d.lastX
      const dy = e.clientY - d.lastY
      d.lastX = e.clientX
      d.lastY = e.clientY
      vp.current = { ...vp.current, x: vp.current.x - dx / vp.current.z, y: vp.current.y - dy / vp.current.z }
      syncViewport()
      return
    }
    if (d.kind === 'ruler') {
      const [ox, oy] = origin.current
      const sx = e.clientX - ox
      const sy = e.clientY - oy
      const r = ruler.current!
      if (d.grab === 'move') {
        ruler.current = { ...r, cx: r.cx + (sx - d.last[0]), cy: r.cy + (sy - d.last[1]) }
      } else {
        // Rotate about the centre, following the pointer's bearing.
        ruler.current = { ...r, angle: Math.atan2(sy - r.cy, sx - r.cx) }
      }
      d.last = [sx, sy]
      drawOverlay()
      return
    }

    if (d.kind === 'erase') {
      const [ox, oy] = origin.current
      const sx = e.clientX - ox
      const sy = e.clientY - oy
      const [wx, wy] = screenToWorld(vp.current, sx, sy)
      eraseAt(wx, wy, eraserMode)
      drawOverlay(null, [sx, sy])
      return
    }

    if (d.kind === 'marquee' || d.kind === 'move') {
      const [ox, oy] = origin.current
      const [wx, wy] = screenToWorld(vp.current, e.clientX - ox, e.clientY - oy)
      if (d.kind === 'marquee') {
        d.rect = [d.start[0], d.start[1], wx, wy]
        drawOverlay(d.rect)
      } else {
        if (!d.active) {
          const travelled =
            Math.hypot(wx - d.startWorld[0], wy - d.startWorld[1]) * vp.current.z
          if (travelled < MOVE_THRESHOLD_PX) return
          d.active = true
          d.lastWorld = d.startWorld
        }
        const dx = wx - d.lastWorld[0]
        const dy = wy - d.lastWorld[1]
        d.lastWorld = [wx, wy]
        translateSelection(selection.current, dx, dy)
        drawOverlay()
      }
      return
    }
    if (supportsRaw) return // already handled on pointerrawupdate
    for (const c of e.nativeEvent.getCoalescedEvents()) {
      extend(c.clientX, c.clientY, c.timeStamp, 'coalesced')
    }
  }

  const finish = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return
    activePointer.current = null
    const d = drag.current
    drag.current = null
    const l = layer.current!

    if (d?.kind === 'erase') {
      drawOverlay()
      const after = [...l.strokes]
      if (after.length === d.before.length && after.every((s, i) => s === d.before[i])) return
      const before = d.before
      // Already applied by the live drag, so `do` only matters on redo.
      history.current!.push({
        label: 'erase',
        do: () => l.setStrokes([...after]),
        undo: () => l.setStrokes([...before]),
      })
      return
    }

    if (d?.kind === 'marquee') {
      const picked = l.strokesIn(d.rect)
      if (!e.shiftKey) selection.current = new Set()
      for (const s of picked) selection.current.add(s.id)
      const norm = normRect(d.rect)
      for (const t of itemsRef.current) {
        if (boundsIntersect(itemBounds(t), norm)) selection.current.add(t.id)
      }
      bumpSelection()
      drawOverlay()
      return
    }

    if (d?.kind === 'move') {
      // Total travel is exactly lastWorld - startWorld: activation resets
      // lastWorld to startWorld, and both then advance by the same deltas.
      const dx = d.lastWorld[0] - d.startWorld[0]
      const dy = d.lastWorld[1] - d.startWorld[1]
      if (!d.active || (dx === 0 && dy === 0)) return
      const ids = new Set(selection.current)
      // The drag already moved them live. Rewind, then push the command so its
      // do/undo pair is the single source of truth for the move.
      translateSelection(ids, -dx, -dy)
      history.current!.push({
        label: 'move',
        do: () => translateSelection(ids, dx, dy),
        undo: () => translateSelection(ids, -dx, -dy),
      })
      drawOverlay()
      return
    }

    if (d?.kind !== 'ink') return
    const done = engine.current!.end()
    engine.current!.clear()
    if (done) commitStroke(done.stroke, done.path)
  }

  // --- wheel ---------------------------------------------------------------

  useEffect(() => {
    const stage = stageRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Cached origin: trackpad wheel events arrive in dense bursts, and
      // getBoundingClientRect in that loop is a forced layout per event.
      const [ox, oy] = origin.current
      const sx = e.clientX - ox
      const sy = e.clientY - oy
      // Trackpad pinch arrives as a wheel event with ctrlKey set.
      if (e.ctrlKey || e.metaKey) {
        vp.current = zoomAt(vp.current, vp.current.z * Math.exp(-e.deltaY / 180), sx, sy)
      } else {
        vp.current = {
          ...vp.current,
          x: vp.current.x + e.deltaX / vp.current.z,
          y: vp.current.y + e.deltaY / vp.current.z,
        }
      }
      syncViewport()
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [syncViewport])

  /** Zooms about the centre of the stage. */
  const zoomTo = (z: number) => {
    const stage = stageRef.current!
    vp.current = zoomAt(vp.current, z, stage.clientWidth / 2, stage.clientHeight / 2)
    syncViewport()
  }

  const fitToContent = () => {
    const l = layer.current!
    const stage = stageRef.current!
    const content = unionRects([
      ...l.strokes.map((s) => s.bounds),
      ...itemsRef.current.map(itemBounds),
    ])
    if (!content) return
    const [x0, y0, x1, y1] = content
    const pad = 48
    const z = clampZoom(
      Math.min(stage.clientWidth / (x1 - x0 + pad * 2), stage.clientHeight / (y1 - y0 + pad * 2)),
    )
    vp.current = {
      z,
      x: (x0 + x1) / 2 - stage.clientWidth / 2 / z,
      y: (y0 + y1) / 2 - stage.clientHeight / 2 / z,
    }
    syncViewport()
  }

  return (
    <div className="board">
      <div
        ref={stageRef}
        className={`stage tool-${tool}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={() => {
          if (tool === 'eraser' && !drag.current) drawOverlay()
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={committedRef} />
        <canvas ref={wetRef} />
        <canvas ref={overlayRef} />
        <ItemLayer
          items={items}
          vp={vp.current}
          editingId={editingId}
          selected={selection.current}
          onCommit={commitText}
          onPointerDownItem={(id) => {
            // Recorded, not consumed: the event still bubbles to the stage,
            // which owns selection and drag state.
            pendingTextHit.current = id
          }}
          onEdit={(id) => setEditingId(id)}
        />
      </div>

      <button className="back" onClick={() => navigate('/')} title="All whiteboards">
        ← <span className={`save save-${saveState}`}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'}
        </span>
      </button>

      <Toolbar
        tool={tool}
        pens={pens}
        penIndex={penIndex}
        penFlyout={penFlyout}
        rulerOn={rulerOn}
        recent={recent}
        canUndo={historyState.canUndo}
        canRedo={historyState.canRedo}
        onTool={(t) => (t === 'pen' ? onPenTool() : setTool(t))}
        onPickPen={onPickPen}
        onChangePen={onChangePen}
        onToggleRuler={toggleRuler}
        onOpenTemplates={() => setPickerOpen(true)}
        eraserMode={eraserMode}
        onEraserMode={(m) => {
          setEraserMode(m)
          setTool('eraser')
        }}
        noteColors={NOTE_COLORS}
        noteColor={noteColor}
        onNoteColor={(c) => {
          setNoteColor(c)
          setTool('note')
        }}
        reactions={REACTIONS}
        reaction={reaction}
        onReaction={(r) => {
          setReaction(r)
          setTool('reaction')
        }}
        onCloseTray={() => setPenFlyout('none')}
        onClosePopup={() => setPenFlyout('tray')}
        onUndo={() => {
          history.current!.undo()
          drawOverlay()
        }}
        onRedo={() => {
          history.current!.redo()
          drawOverlay()
        }}
      />

      {pickerOpen && (
        <TemplatePicker onPick={armTemplate} onClose={() => setPickerOpen(false)} />
      )}

      {placingName && (
        <div className="placing-banner">
          Click to place <strong>{placingName}</strong>
          <button onClick={cancelPlacing}>Cancel</button>
        </div>
      )}

      <div className="zoom dock">
        <button
          className="dock-btn"
          onClick={() => zoomTo(vp.current.z / 1.25)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <span className="chip">
            <MsIcon name="zoomOut" />
          </span>
        </button>
        <button className="dock-btn label" onClick={() => zoomTo(1)} title="Reset to 100%">
          {zoomLabel}%
        </button>
        <button
          className="dock-btn"
          onClick={() => zoomTo(vp.current.z * 1.25)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <span className="chip">
            <MsIcon name="zoomIn" />
          </span>
        </button>
        <button
          className="dock-btn"
          onClick={fitToContent}
          title="Fit to screen"
          aria-label="Fit to screen"
        >
          <span className="chip">
            <MsIcon name="fit" />
          </span>
        </button>
      </div>
    </div>
  )
}
