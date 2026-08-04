# Whiteboard — self-hosted Microsoft Whiteboard clone

Plan: `~/.claude/plans/fancy-stirring-lighthouse.md`

```bash
npm install
npm run dev     # Vite on :5173 + Fastify on :3001, /api proxied
```

- `http://localhost:5173/` — dashboard; `/b/:id` — a board
- `http://localhost:5173/spike.html` — ink spike (phase 1).
  Add `?raw=0` to force the `pointermove` + `getCoalescedEvents()` fallback
  that Chrome otherwise never takes.

For a single-process run: `npm run build && npm start` serves the built
frontend and the API together on `:3001`. State lives under `data/`
(`whiteboard.db`, `docs/<id>.json`, `thumbs/<id>.png`) — one directory to
mount as a volume, and `DATA_DIR` moves it.

## What MS Whiteboard actually does (measured, not guessed)

MS Whiteboard renders ink as **SVG outline fills** — `<path fill="…">` with no
`stroke` — which is the same model as `perfect-freehand`. That makes its exact
geometry readable from the live app, so these are measurements off real
strokes rather than eyeballed approximations:

| Property | Finding |
|---|---|
| Ink coordinate space | 1/128 CSS px per unit (`transform: matrix(0.0078125, …)`) |
| Stroke outline | polyline offset with a vertex per sample; straight `L` segments between offset points, **no curve smoothing anywhere** |
| Positional filtering | **none.** Across real human strokes, turn angle between consecutive segments scales inversely with segment length: >8px steps turn a median 1.5°, but sub-pixel steps turn a median 13.9° with a p90 of **173°** — full reversals. That is raw pointer jitter passed straight through; any streamline filter would have removed precisely those |
| Width | **constant along the stroke** — no velocity thinning for mouse input |
| Joins / caps | `A<r>,<r>` arcs at every vertex and both ends, `r` = half the width — round joins, round caps |
| Thickness scale | step 0 → r 64 (**1px**), step 2 → r 256 (**4px**), step 5 → r 768 (**12px**) |
| Pen ink | `fill="rgba(91,49,141,1)"` etc., `fill-opacity: 1`, `mix-blend-mode: normal` |
| Highlighter | `fill="rgba(252,252,0,0.4)"`, **normal blend — straight alpha at 40%, not multiply**, and pure `#FCFC00`, not the pen yellow |
| Layering | MS itself splits `wetInk` / `wetInkHighlighter` from committed `inkGroup` elements — the same wet/committed split this project uses |
| Wheel | canvas carries `preventPan preventWheelPan` classes — wheel is pan, as planned |

Consequences, already applied: `DEFAULT_TUNING` uses `thinning: 0`,
`streamline: 0` and `smoothing: 0` — MS's perceived smoothness comes from
sample rate and round joins, not from any filtering. The path builder emits
straight `L` segments (`outlineStyle: 'straight'`) rather than the canonical
perfect-freehand quadratics-through-midpoints, which round off sharp
reversals; measured on a 180° reversal, the quadratic builder truncates the
apex by 1px, and straight segments are also cheaper to build.
`THICKNESS_STEPS` is `[1, 2, 4, 6, 8, 12]`, and the highlighter defaults to
alpha-40 pure yellow. Thickness steps 1, 3 and 4 are interpolated between the
three measured points; everything else in that table is measured off rendered
geometry.

Not measured, and guessed rather than derived: thickness steps 1, 3 and 4, and
the highlighter's default thickness (`DEFAULT_PENS[3].step = 4`, 8px). Its
*opacity* of 40 is measured; its default width is not.

Thickness is **world-constant, not screen-constant**: the step-5 reading was
taken at 42% zoom and still returned r=768 (12 world px), landing on the same
64-unit grid as the 100% readings. Screen-constant would have given r≈1829.

Realistic sharp geometry stays exact under the tail-window renderer — a 180°
V and a hard corner both give `missingPx: 0` with only 12–35 extra rim pixels.
A synthetic zigzag reversing 240px *per sample* does diverge, but no hand
produces that.

`thinning` and the pressure knobs stay in the engine for a future stylus path.

## Phase 1 — ink spike

The spike exists to settle how the ink *feels* before any app is built around
it, because **MS Whiteboard becomes read-only on Aug 22 2026** and after that
there is nothing left to compare against.

### Do this before Aug 22

1. Export all boards from https://whiteboard.cloud.microsoft/me.
2. Screen-record yourself inking in MS Whiteboard: fast loops, slow curves,
   sharp direction reversals, stroke ends. Dark purple @3 and Red @3.
3. Open `spike.html` side by side with a real board and tune, in this order:
   - **`streamline`** — the big one. Too high = the line trails the cursor and
     snaps forward when you stop. Too low = visible sample jitter. Start 0.25.
   - **`smoothing`** — outline softness only, no latency cost.
   - **`thinning`** + **`speed→pressure`** — how much fast strokes narrow.
     MS narrows noticeably on quick flicks.
   - **`pressure smooth`** — raise it if width pulses on steady strokes.
   - **`highlighter multiply`** — decides what happens when highlighter
     crosses existing ink. Measured over black ink at α35: alpha mode washes
     the ink out to `rgb(109,94,37)`, multiply keeps it dark at
     `rgb(31,29,22)`. Neither changes anything over blank canvas. Compare
     against MS and pick.
4. Write the values you land on into `DEFAULT_TUNING` in `src/canvas/types.ts`.

### Measured on this machine (Chrome, macOS, dpr 2)

| Check | Result |
|---|---|
| `pointerrawupdate` available | yes — used, coalesced path stays off |
| `desynchronized` content persistence | **OK** — the direct wet-canvas path is usable |
| Per-sample synchronous cost | 0.5–0.6 ms worst |
| 2000 strokes, first paint (outline build) | 144 ms |
| 2000 strokes, redraw with warm outline cache | **1.4 ms** — pan/zoom has headroom |
| Highlighter α35, single self-crossing stroke | no darkening at the crossing |
| Accepted spine points across `streamline` 0→0.9 | flat (300/301 of 300) — the sample gate is on raw movement, so high streamline no longer starves the spine |
| `pointermove` + coalesced fallback (`?raw=0`) | draws correctly |
| Tail-window render vs whole-stroke render (pixel diff) | **0 missing px** in every case; incremental is a strict superset, fatter by a sub-pixel antialias rim (~2% of inked px, all on the boundary) |

Equivalence was measured with `__spike.equivalence(pts, size)` over a
figure-eight and a fast thin zigzag, at `size` 2/3/6/16, `smoothing` 0→1 and
`window` 4→32. `missingPx` was 0 throughout — the tail window never leaves a
gap or a seam. `smoothing` had no effect on the diff at all, and `window` size
barely mattered, which is what confirms the tail-window approach rather than
just failing to disprove it.

### How the ink pipeline works

`src/canvas/inkEngine.ts`

- Samples come from `pointerrawupdate` (not rAF-throttled). If unavailable,
  `pointermove` + `getCoalescedEvents()` instead — **never both**, or every
  sample is counted twice.
- Each sample is filtered by our own causal streamline pass, given a
  velocity-derived pressure, and appended to the stroke *spine*.
- Only the last `tuning.window` spine points are re-outlined per sample, so
  cost is flat no matter how long the stroke gets. This works because
  `perfect-freehand` is called with `streamline: 0` and explicit pressure, so
  its output depends only on the points passed in. Measured against a
  whole-stroke render it never drops a pixel; it only adds a sub-pixel
  antialias rim where consecutive fills overlap, so the wet stroke is a hair
  fatter than the committed one until `pointerup` redraws it.
- `MIN_TAIL_WINDOW` (4) is a hard floor: consecutive re-outlines have to
  overlap by several points, or the round end caps become the only thing
  joining them and a thin fast stroke breaks into dashes.
- Opaque pen ink fills the wet canvas directly. **Translucent ink and the
  highlighter accumulate in an offscreen buffer at full opacity** and get
  blitted through `globalAlpha` per dirty rect, so a stroke composites exactly
  once. Filling translucent segments directly would darken every overlap and
  self-crossing inside one stroke, which MS Whiteboard does not do.
- On `pointerup` the spine is landed on the true final pointer position.
  Without that the stroke stops short of where you lifted, which reads as lag.
- `getPredictedEvents()` is deliberately unused — prediction overshoot is
  exactly the "jumping around" being designed out.
- Pointer position comes from `clientX/clientY` minus a rect cached at
  `pointerdown`, not `offsetX/offsetY`: offsets are relative to the event
  target, which stops being the stage once anything is layered over the canvas,
  and reading the rect per sample forces layout inside the synchronous path.

### Known environment quirk

Chrome DevTools Protocol screenshots of this page time out while a
`desynchronized` canvas is live. The page itself is fine — verify rendering by
sampling `getImageData` instead of screenshotting.

## Phase 2 — canvas core

`src/canvas/viewport.ts`, `src/canvas/renderer.ts`, `src/board/Board.tsx`.

Infinite canvas with the camera as `{x, y, z}` (world coords of the top-left
corner, plus world units per screen pixel). Zoom is clamped to **0.02 – 64**,
where float64 coordinates still render exactly. Panning: wheel / two-finger
trackpad, middle-drag, right-drag (context menu suppressed), held space, and
the hand tool. Zoom: `ctrl/cmd + wheel` (which is also how trackpad pinch
arrives) anchored at the cursor, plus the −/100%/+/fit controls.

The `Path2D` outline cache is keyed by stroke id and **never evicted on cull**.
Outlines live in world space, so they are zoom-independent; dropping them when
a stroke leaves the viewport would make it pay the build cost again on the way
back and stutter the pan.

Measured with 4000 synthetic strokes spread over a 32000px grid:

| Viewport | Strokes drawn | Redraw |
|---|---|---|
| 100%, normal view | 12 of 4000 | 0.1 ms |
| z 0.02, everything visible, cold | 4000 | 215 ms |
| z 0.02, everything visible, warm | 4000 | **2.8 ms** |
| z 0.5 | 40 | 0.2 ms |
| z 64 | 1 | 0.9 ms |

Culling works, and the warm figure after zooming out, in, and out again is the
proof that cache retention across culling behaves as intended. The 215 ms is a
one-time outline build for strokes never yet seen.

In dev, `window.__board` exposes `vp`, `layer()`, `setViewport()`,
`addStrokes()`, `selection()`, `history()`, `engine()`, `drag()` and
`hitTest()` so the canvas core can be exercised without synthesising hundreds
of pointer events.

## Phase 3 — toolbar, pen tray, pen settings

`src/board/Toolbar.tsx`, `src/board/PenSettingsPopup.tsx`.

Laid out like MS: a separate undo pill on the left, then the tool pill
(select · hand · pen · sticky · reaction · text · shapes · templates · more).
Buttons for features not built yet are rendered **disabled rather than
omitted**, so the shape stays 1:1 and the remaining slots are visible. Redo
only appears once there is something to redo, as in MS.

Flyout behaviour copies the real app: picking the pen tool opens the tray,
picking it again toggles it, and clicking the *already-selected* tray slot
opens that pen's settings. Pressing on the canvas dismisses both.

The settings popup carries the 6-step thickness slider over a tapered wedge
track, the opacity slider (1–100) over a checkerboard that shows the pen colour
through it plus a numeric box, a recent-colour row, the swatch grid, and the
arrow-tip row. Verified end to end: picking Orange, thickness step 5 and
opacity 60 produces a stroke of `#F36323` at `size: 12`, `opacity: 60` — and
12px is exactly what MS's step 5 measured (r=768).

Deferred, and disabled in the UI rather than faked: the "More colors" custom
picker, the Rainbow and Galaxy gradient inks, arrow tips, and the lasso.

Keyboard: `V` select, `H` hand, `P` pen, `1`–`4` pick a tray slot. MS binds
slots to `Ctrl+W,1..6`, which a browser cannot have — `Ctrl+W` closes the tab.

## Phase 4 — select and undo/redo

`src/canvas/history.ts`, `src/canvas/overlay.ts`, plus geometry queries on
`CommittedLayer`.

Selection chrome lives on a third canvas above the wet layer and is drawn in
**screen** space, so the marquee and the dashed selection box keep a 1px weight
at every zoom.

- **Hit-testing** uses a bounds prefilter, then `isPointInPath` against the
  cached world-space outline on a scratch context left at identity. A tolerance
  cross of `6 / z` world units is probed so a 1px stroke stays clickable when
  zoomed out. Topmost (last drawn) wins.
- **Marquee** selects on bounds intersection; shift extends the selection.
- **Move** translates points and bounds, and translates the cached `Path2D` via
  `addPath` with a `DOMMatrix` rather than rebuilding the outline — a drag must
  not pay the outline cost again.
- **Undo/redo** is a command stack (cap 200) where each command owns both
  directions, so undo never replays from the start. Delete captures each
  stroke's index before removal, so undo restores z-order rather than dumping
  strokes on top. A live move is rewound on pointerup and re-applied through the
  command, so the command pair stays the single source of truth.
- Keys: `Delete`/`Backspace`, `Cmd/Ctrl+A`, `Escape`, `Cmd/Ctrl+Z`,
  `Cmd/Ctrl+Shift+Z`.

A move only starts once the pointer has travelled `MOVE_THRESHOLD_PX` (3px on
screen). Without it, jitter during a shift-click to extend a selection commits
a 1px move to the undo stack.

Verified programmatically: hit on/off stroke, tolerance behaviour,
topmost-wins, marquee inclusion and exclusion, move → undo restoring bounds
exactly, redo reapplying, delete → undo restoring `a,b,c` order, redo branch
cleared by a new command, hit-testing still correct after strokes are removed
and re-inserted, and the undo pill reacting — with redo appearing only when
there is something to redo and disappearing again once consumed.

Verified with real pointer input: marquee select, `v`/`p` tool keys.

Verified with dispatched DOM events (which drive React's handlers even in a
backgrounded tab, where real pointer input is not delivered): click-select,
drag-move commit and its undo, `Delete`, `Cmd+Z`, and both undo/redo pill
buttons.

## Phase 5 — text

`src/board/TextLayer.tsx`.

Text is DOM, not canvas: native rendering, caret, selection and IME beat
anything reimplemented on a 2D context. Each box is positioned in **screen**
coords with `fontSize = world × z`, *not* one layer under
`transform: scale(z)` — a scaled layer rasterises once and stretches the
bitmap, which is blurry and hits browser layer-size limits well before z=64.

Behaviour: the text tool places a box and focuses it; blur commits; an
untouched empty box is discarded without an undo entry; double-click re-enters
a finished box; clicking existing text with the text tool edits it instead of
stacking a new box on top. Text participates in the same selection, move,
delete, and undo/redo as ink — `translateSelection` moves strokes on the canvas
and text in the DOM together, and the selection bounds measure text from its
rendered element, the only thing that knows the real wrapped size.

Verified (synthetic DOM events, which drive React's handlers even in a
background tab): create → commit → undo → redo; empty box discarded with
history untouched; font and position scaling (z=4 → 96px at left 1600px,
z=0.5 → 12px at 200px, from a 24px world size at x=400); click-select; drag
move 400→480 then undo restoring 400; marquee picking up text; `Delete` then
undo restoring the content; edit "first"→"second" with undo and redo across
both; and the text tool reusing an existing box rather than stacking.

**Wrap width has to be world-space.** `TextItem.w` is in world units and
reaches CSS as `width: max-content` + `max-width: w × z`. Two traps:
`width: auto` makes an absolutely positioned box shrink-to-fit against the
*remaining space in its containing block*, so a box near the right edge
rewraps as the viewport moves; and `max-content` is invalid inside `min()`
(intrinsic keywords are not allowed in CSS math functions), so
`width: min(max-content, Npx)` is silently dropped and the box falls back to
auto. Both were live bugs, caught by measuring rendered world size across
zooms. Now 480×60 world units at z = 0.25, 1, 4 and 16. Below about z = 0.1 it
drifts — Chrome's minimum font size changes the line count when text is around
a pixel tall.

Also: `fitToContent` includes text, so a text-only board still fits. Text
inherits the active pen's colour (MS gives text its own colour set — a
deliberate simplification). Text items all render as DOM regardless of
viewport; unlike strokes they are not culled, which is fine at realistic counts
but is not symmetric with the canvas layer.

Note: React delegates `onBlur` from `focusout`, so a dispatched `blur` event
never reaches it — tests must dispatch `focusout`.

## Phase 6 — backend, dashboard, folders, autosave

`server/` (Fastify + better-sqlite3), `src/api.ts`, `src/router.ts`,
`src/dashboard/`, `src/board/thumbnail.ts`.

SQLite holds board and folder metadata; documents and thumbnails are files
under `data/`. Boards keep a `folder_id` with `ON DELETE SET NULL`, so deleting
a folder moves its boards back to the root instead of destroying them —
verified end to end, not just declared in the schema.

Autosave hangs off the undo stack's change callback: every mutation already
goes through `History`, so that is the one place that knows the document is
dirty. Writes are debounced 1500 ms, and a `pagehide` handler flushes through
`sendBeacon` so closing the tab mid-debounce cannot drop the last edits. A
failed save leaves the board dirty so the next edit retries, and the state
shows next to the back button.

The document is written whole rather than as an op log. That is correct and
far simpler for one user; op-sync only becomes necessary when two clients can
edit one board at once.

Routing is ~20 lines over `history.pushState` — two routes and no query
strings did not justify a router dependency. `<Board key={boardId}>` remounts
on navigation, so no stale document or undo stack survives.

**No `prompt`/`confirm` anywhere.** Rename, move-to-folder and both deletes are
inline: native dialogs block the entire page (and any automation driving it),
and MS renames in place regardless.

Verified: full API surface via curl; create board → ink → text → autosave →
`GET /doc` shows both; reload restores strokes and text with an empty undo
stack; thumbnail served as PNG and cache-busted per save; folder create,
filter, move-between-folders; folder delete returning its boards to the root;
two-step board delete agreeing with the server listing.

One trap worth recording: a Fastify handler that returns `reply.code(204)`
*without* `.send()` never responds — the request just hangs. Four routes had
it.

## Phase 7 — packaging

`Dockerfile`, `docker-compose.yml`.

```bash
docker compose up -d          # http://localhost:3001
```

Two stages sharing one base image, because `better-sqlite3` is a native module
and its compiled binding has to match the runtime's libc. The build stage adds
a toolchain, builds the frontend, then `npm prune --omit=dev` so build-only
packages never reach the runtime image. There is no separate server compile
step — Node strips the types in place, so the only build artefact is the
frontend bundle.

All state is under `/data` (SQLite db, board documents, thumbnails), mounted as
a named volume. `DATA_DIR` relocates it.

### Optional password

Set `APP_PASSWORD` (and optionally `APP_USER`, default `whiteboard`) to require
HTTP Basic auth on every request. It is off by default.

**Basic auth is base64, not encryption.** It is appropriate for a board on a
trusted LAN. Anything reachable from the internet should sit behind a reverse
proxy terminating TLS — this app does not do TLS itself.

Verified: 401 with no credentials, 401 on a wrong password, 401 on a wrong
username, 200 with the right pair, and the comparison is constant-time.

### Not verified

**The image has never been built** — no Docker daemon was running on this
machine. What *was* verified is the process the container runs: `npm start`
serving the API, the SPA fallback and the root all returning 200 in a single
process, and that every module the server imports is a production dependency,
so `npm prune --omit=dev` cannot break it. Run `docker compose up --build` once
to close the gap.
