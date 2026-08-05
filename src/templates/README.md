# Template catalogue — sourcing notes

`catalog.ts` exports `TEMPLATES`: 20 templates across the categories MS
Whiteboard's own support docs describe (Brainstorming, Retrospective,
Strategy, Design and research, Project planning, Problem solving, Learning,
Workshop, Icebreaker). Not yet wired into the app — no existing file imports
it, per the task's file-scope limit.

## Sourcing

MS never publishes template geometry, and its support pages (fetched during
this research) name templates and categories but stop at one-line purpose
descriptions — no column counts, no labels, no coordinates:

- https://support.microsoft.com/en-us/whiteboard/insert-templates-in-whiteboard
- https://support.microsoft.com/en-us/office/retrospectives-in-microsoft-whiteboard-c7dfe73e-61e1-4366-be76-a424741ee226
- https://support.microsoft.com/en-us/office/strategic-planning-in-microsoft-whiteboard-9a4c99a2-e9bb-4c6c-9841-c629b45a03f6
- https://support.microsoft.com/en-us/whiteboard/design-led-thinking-in-microsoft-whiteboard
- https://support.microsoft.com/en-us/office/project-planning-in-microsoft-whiteboard-cc314443-6668-41b8-849d-8d9bcee271a0
- https://support.microsoft.com/en-us/office/ice-breakers-and-fun-with-microsoft-whiteboard-84cb0bef-2361-4362-8b97-70d870c4d23a
- https://techcommunity.microsoft.com/blog/microsoft_365blog/microsoft-whiteboard-announces-preview-of-new-templates/870604 (named the
  preview batch: Brainstorming, Effective meeting, Kanban sprint planning,
  SWOT analysis, Problem solving, Project planning, Retrospective, Project
  milestones, KWL)

So the actual zone rectangles in `catalog.ts` are original layouts of
well-known, non-proprietary facilitation frameworks — SWOT, the Osterwalder
Business Model Canvas, empathy maps, Kanban columns, Start/Stop/Continue,
4Ls, KWL, 5 Whys — not transcriptions of anything MS shipped. These
frameworks predate and exist independently of MS Whiteboard, which is exactly
why the task scoped the deliverable to "functional layout structure and
generic labels."

Every template name the fetched docs explicitly named is included, **except**
"cost/benefit analysis" and "goal setting" (Strategy doc) and "Choose your
favorite" (Icebreaker doc) — mentioned only in passing with no framework
recognizable enough to lay out with confidence, unlike SWOT or Business Model
Canvas which are standard enough to model precisely. The rest of the 20 are
either docs-named (Effective Meeting, Kanban, SWOT, KWL, Empathy Map, Journey
Map, Affinity Diagram, Daily Stand-up, Project Kickoff, Two Truths and a Lie,
Compare and Contrast, Project Milestones) or are the specific frameworks the
*task itself* named as examples (Mind Map, Flowchart, Business Model Canvas,
Effort/Impact) plus close relatives of docs-named categories (Start/Stop/
Continue and 4Ls under "Retrospective", 5 Whys under "Problem solving").
An earlier draft also included Mad/Sad/Glad and a Sailboat retrospective;
both were cut to make room for the docs-named Project Kickoff and Compare and
Contrast, since neither appears in any fetched source and Mad/Sad/Glad
structurally duplicates Start/Stop/Continue.

## What's deliberately approximated

- **Mind Map** — MS grows branches dynamically as you add them (a real
  radial layout engine). This entry is a static starting arrangement: one
  centre node plus 6 fixed branch slots, not a layout algorithm.
- **Affinity Diagram** — MS's version is a blank canvas plus instructional
  arrows/arrows-as-artwork. Modelled here as a single open region with a
  one-line instruction header; there's no fixed grid to capture.
- **5 Whys instead of a fishbone/Ishikawa diagram** — fishbone diagrams are
  inherently diagonal (cause lines meeting a central spine at an angle),
  which doesn't reduce to axis-aligned `TemplateZone` rectangles without
  faking it. 5 Whys is the other standard root-cause format and *is* a clean
  linear grid, so it's used instead. If MS Whiteboard's own catalogue
  specifically has a fishbone template, this substitutes a different
  standard problem-solving format rather than distorting one to fit the
  rectangle model.
- **Two Truths and a Lie** — the template's actual distinctiveness in MS is
  the game mechanic and decorative avatars, not a layout. Modelled as six
  generic "player card" slots.
- **Journey Map row labels** — real MS journey maps put the row name in a
  narrow label column to the left of each lane; here each lane is one
  full-width zone carrying the row name as its `label`, since there's no
  separate label-column concept in the `TemplateZone` shape.
- **Compare and Contrast** — a true two-circle Venn needs overlapping
  ellipses, which `TemplateZone` (axis-aligned rectangles only) can't
  express. Modelled as the same three-way split — only-A, both, only-B —
  laid out as three columns instead.

## Not sourced / could not verify

No independent source enumerates the *complete* current template list with
per-template layouts — MS's in-app template picker is the only place that
actually shows them, and it wasn't accessible from this research pass (no
Microsoft 365 session). The 20 templates here are a representative cross-
section built from the categories and named examples MS's docs and blog
coverage do confirm, not an exhaustive or verified-against-the-product catalogue.

## Geometry conventions

- All coordinates and sizes are world units on a 20-unit grid, origin at
  each template's top-left, so the app can place a template anywhere on the
  board by translating its zones.
- `kind: 'header'` — title bars, axis-label bands, and bookend nodes
  (start/end, root cause, a mind map's centre topic).
- `kind: 'region'` — content cells: SWOT quadrants, matrix cells, canvas
  blocks.
- `kind: 'lane'` — repeated parallel strips: Kanban columns, journey-map
  rows, a milestone timeline's spine.
- Fills are soft pastel hex tones, reused by hand across templates rather
  than pulled from a shared palette constant, since this is a flat data
  table meant to be read top-to-bottom.
- Zones are meant to be drawn in array order. `empathy-map`'s persona box
  is listed last and intentionally overlaps the boundary between all four
  quadrants — a renderer that draws in order paints it on top, as intended;
  drawing any other order would bury it.

## Verification

`tsc --noEmit -p tsconfig.app.json` passes. Also checked with a throwaway
script (not committed): every zone's `x/y/w/h` and every template's `w/h`
are multiples of 20, every zone's `x+w`/`y+h` stays within its template's
`w`/`h` (the empathy-map persona overlap above is an *interior* overlap
between zones, not an out-of-bounds one), all 20 ids are unique, and every
template has a non-empty `id`/`name`/`category`/`description`. Also confirmed
`tsc` genuinely inspects this file by injecting a deliberate type error and
watching it fail, then reverting.
