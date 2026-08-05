// Structured layout data for MS Whiteboard's built-in template catalogue.
// See ./README.md for sourcing notes and what's deliberately approximated —
// short version: MS's own docs describe *categories* and *purposes* but never
// publish the pixel geometry, so the zone rectangles below are original
// interpretations of well-known, non-proprietary facilitation frameworks
// (SWOT, Business Model Canvas, empathy maps, Kanban, retro formats, …).
// Where a template's MS identity is mostly illustration rather than
// structure (icebreakers, affinity diagrams), only the functional grid is
// modelled and the gap is called out per-template below.

export interface TemplateZone {
  x: number; y: number; w: number; h: number
  label?: string
  /** Header band, plain region, or a lane divider. */
  kind: 'header' | 'region' | 'lane'
  /** Hex fill, optional. Use soft neutral/pastel tones. */
  fill?: string
}

export interface Template {
  id: string
  name: string
  category: string
  description: string
  /** Overall size in world units. */
  w: number; h: number
  zones: TemplateZone[]
}

// Pastel fills reused across templates — kept as literals per zone (not a
// lookup) because the data is meant to be read top-to-bottom as a layout,
// not indirected through a palette module.

export const TEMPLATES: Template[] = [
  // ---------------------------------------------------------------- Brainstorming
  {
    id: 'brainstorm-blank',
    name: 'Brainstorming',
    category: 'Brainstorming',
    description: 'Blank canvas with a prompt header — sticky notes go anywhere, sorted later.',
    w: 800,
    h: 600,
    zones: [
      { x: 0, y: 0, w: 800, h: 80, kind: 'header', label: 'Brainstorm — capture every idea, sort it later', fill: '#EDE9FE' },
      { x: 0, y: 80, w: 800, h: 520, kind: 'region', label: 'Idea board (blank — add sticky notes freely)', fill: '#FFFFFF' },
    ],
  },
  {
    // MS's mind map template auto-lays branches out from a centre node as
    // you add them; a static catalogue entry can only offer a starting
    // arrangement, so this is 6 fixed slots around a centre rather than the
    // real template's dynamic radial layout.
    id: 'mind-map',
    name: 'Mind Map',
    category: 'Brainstorming',
    description: 'Central topic with branches radiating to related ideas.',
    w: 1000,
    h: 800,
    zones: [
      { x: 0, y: 0, w: 1000, h: 60, kind: 'header', label: 'Mind Map', fill: '#EEF2FF' },
      { x: 400, y: 340, w: 200, h: 120, kind: 'header', label: 'Central topic', fill: '#FDE68A' },
      { x: 80, y: 80, w: 160, h: 100, kind: 'region', label: 'Idea 1', fill: '#DBEAFE' },
      { x: 760, y: 80, w: 160, h: 100, kind: 'region', label: 'Idea 2', fill: '#DCFCE7' },
      { x: 20, y: 340, w: 160, h: 100, kind: 'region', label: 'Idea 3', fill: '#FCE7F3' },
      { x: 820, y: 340, w: 160, h: 100, kind: 'region', label: 'Idea 4', fill: '#FFEDD5' },
      { x: 80, y: 620, w: 160, h: 100, kind: 'region', label: 'Idea 5', fill: '#EDE9FE' },
      { x: 760, y: 620, w: 160, h: 100, kind: 'region', label: 'Idea 6', fill: '#FEF9C3' },
    ],
  },

  // ---------------------------------------------------------------- Retrospective
  {
    id: 'start-stop-continue',
    name: 'Start / Stop / Continue',
    category: 'Retrospective',
    description: 'Three-column retro: what to start doing, stop doing, and keep doing.',
    w: 1200,
    h: 700,
    zones: [
      { x: 0, y: 0, w: 1200, h: 80, kind: 'header', label: 'Start / Stop / Continue', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 400, h: 620, kind: 'region', label: 'Start', fill: '#DCFCE7' },
      { x: 400, y: 80, w: 400, h: 620, kind: 'region', label: 'Stop', fill: '#FEE2E2' },
      { x: 800, y: 80, w: 400, h: 620, kind: 'region', label: 'Continue', fill: '#DBEAFE' },
    ],
  },
  {
    id: 'four-ls',
    name: '4Ls Retrospective',
    category: 'Retrospective',
    description: 'Liked, Learned, Lacked, Longed For — a 2x2 reflection grid.',
    w: 1000,
    h: 800,
    zones: [
      { x: 0, y: 0, w: 1000, h: 80, kind: 'header', label: '4Ls Retrospective', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 500, h: 360, kind: 'region', label: 'Liked', fill: '#DCFCE7' },
      { x: 500, y: 80, w: 500, h: 360, kind: 'region', label: 'Learned', fill: '#DBEAFE' },
      { x: 0, y: 440, w: 500, h: 360, kind: 'region', label: 'Lacked', fill: '#FFEDD5' },
      { x: 500, y: 440, w: 500, h: 360, kind: 'region', label: 'Longed For', fill: '#EDE9FE' },
    ],
  },
  // ---------------------------------------------------------------- Strategy
  {
    id: 'swot-analysis',
    name: 'SWOT Analysis',
    category: 'Strategy',
    description: 'Strengths, Weaknesses, Opportunities, Threats — a classic 2x2.',
    w: 1000,
    h: 800,
    zones: [
      { x: 0, y: 0, w: 1000, h: 80, kind: 'header', label: 'SWOT Analysis', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 500, h: 360, kind: 'region', label: 'Strengths', fill: '#DCFCE7' },
      { x: 500, y: 80, w: 500, h: 360, kind: 'region', label: 'Weaknesses', fill: '#FEE2E2' },
      { x: 0, y: 440, w: 500, h: 360, kind: 'region', label: 'Opportunities', fill: '#DBEAFE' },
      { x: 500, y: 440, w: 500, h: 360, kind: 'region', label: 'Threats', fill: '#FEF9C3' },
    ],
  },
  {
    id: 'effort-impact-matrix',
    name: 'Effort / Impact Matrix',
    category: 'Strategy',
    description: 'Prioritise ideas by plotting effort against impact.',
    w: 900,
    h: 920,
    zones: [
      { x: 0, y: 0, w: 900, h: 60, kind: 'header', label: 'Effort / Impact Matrix', fill: '#EEF2FF' },
      // Thin axis-label bands rather than content regions — nothing gets placed in them.
      { x: 0, y: 60, w: 60, h: 800, kind: 'header', label: 'Impact ↑', fill: '#F1F5F9' },
      { x: 60, y: 860, w: 840, h: 60, kind: 'header', label: 'Effort →', fill: '#F1F5F9' },
      { x: 60, y: 60, w: 420, h: 400, kind: 'region', label: 'Quick Wins (low effort, high impact)', fill: '#DCFCE7' },
      { x: 480, y: 60, w: 420, h: 400, kind: 'region', label: 'Major Projects (high effort, high impact)', fill: '#DBEAFE' },
      { x: 60, y: 460, w: 420, h: 400, kind: 'region', label: 'Fill-ins (low effort, low impact)', fill: '#FEF9C3' },
      { x: 480, y: 460, w: 420, h: 400, kind: 'region', label: 'Thankless Tasks (high effort, low impact)', fill: '#FEE2E2' },
    ],
  },
  {
    // Standard Osterwalder 9-block canvas — the layout is a published,
    // generic business-modelling standard, not an MS invention.
    id: 'business-model-canvas',
    name: 'Business Model Canvas',
    category: 'Strategy',
    description: 'The nine-block Osterwalder canvas for mapping a business model.',
    w: 1400,
    h: 900,
    zones: [
      { x: 0, y: 0, w: 1400, h: 60, kind: 'header', label: 'Business Model Canvas', fill: '#EEF2FF' },
      { x: 0, y: 60, w: 280, h: 560, kind: 'region', label: 'Key Partners', fill: '#DBEAFE' },
      { x: 280, y: 60, w: 280, h: 280, kind: 'region', label: 'Key Activities', fill: '#DCFCE7' },
      { x: 280, y: 340, w: 280, h: 280, kind: 'region', label: 'Key Resources', fill: '#DCFCE7' },
      { x: 560, y: 60, w: 280, h: 560, kind: 'region', label: 'Value Propositions', fill: '#FEF9C3' },
      { x: 840, y: 60, w: 280, h: 280, kind: 'region', label: 'Customer Relationships', fill: '#FFEDD5' },
      { x: 840, y: 340, w: 280, h: 280, kind: 'region', label: 'Channels', fill: '#FFEDD5' },
      { x: 1120, y: 60, w: 280, h: 560, kind: 'region', label: 'Customer Segments', fill: '#EDE9FE' },
      { x: 0, y: 620, w: 700, h: 280, kind: 'region', label: 'Cost Structure', fill: '#FEE2E2' },
      { x: 700, y: 620, w: 700, h: 280, kind: 'region', label: 'Revenue Streams', fill: '#FEE2E2' },
    ],
  },

  // ---------------------------------------------------------------- Design and research
  {
    id: 'empathy-map',
    name: 'Empathy Map',
    category: 'Design and research',
    description: 'What the user says, thinks, does and feels, around a persona centre.',
    w: 1000,
    h: 980,
    zones: [
      { x: 0, y: 0, w: 1000, h: 60, kind: 'header', label: 'Empathy Map', fill: '#EEF2FF' },
      { x: 0, y: 60, w: 500, h: 460, kind: 'region', label: 'Says', fill: '#DBEAFE' },
      { x: 500, y: 60, w: 500, h: 460, kind: 'region', label: 'Thinks', fill: '#EDE9FE' },
      { x: 0, y: 520, w: 500, h: 460, kind: 'region', label: 'Does', fill: '#DCFCE7' },
      { x: 500, y: 520, w: 500, h: 460, kind: 'region', label: 'Feels', fill: '#FEF9C3' },
      { x: 400, y: 480, w: 200, h: 80, kind: 'header', label: 'Persona', fill: '#FFFFFF' },
    ],
  },
  {
    id: 'journey-map',
    name: 'Customer Journey Map',
    category: 'Design and research',
    description: 'Stages across the top, with rows for actions, feelings, pain points and opportunities.',
    w: 1400,
    h: 760,
    zones: [
      { x: 0, y: 0, w: 1400, h: 60, kind: 'header', label: 'Customer Journey Map', fill: '#EEF2FF' },
      { x: 0, y: 60, w: 280, h: 60, kind: 'header', label: 'Awareness', fill: '#E0E7FF' },
      { x: 280, y: 60, w: 280, h: 60, kind: 'header', label: 'Consideration', fill: '#E0E7FF' },
      { x: 560, y: 60, w: 280, h: 60, kind: 'header', label: 'Decision', fill: '#E0E7FF' },
      { x: 840, y: 60, w: 280, h: 60, kind: 'header', label: 'Onboarding', fill: '#E0E7FF' },
      { x: 1120, y: 60, w: 280, h: 60, kind: 'header', label: 'Loyalty', fill: '#E0E7FF' },
      { x: 0, y: 120, w: 1400, h: 160, kind: 'lane', label: 'Actions', fill: '#FFFFFF' },
      { x: 0, y: 280, w: 1400, h: 160, kind: 'lane', label: 'Thoughts & Feelings', fill: '#F8FAFC' },
      { x: 0, y: 440, w: 1400, h: 160, kind: 'lane', label: 'Pain Points', fill: '#FEE2E2' },
      { x: 0, y: 600, w: 1400, h: 160, kind: 'lane', label: 'Opportunities', fill: '#DCFCE7' },
    ],
  },
  {
    // MS's affinity diagram is a blank canvas plus instructional arrows —
    // there's no fixed grid to capture, so this stays a single open region.
    id: 'affinity-diagram',
    name: 'Affinity Diagram',
    category: 'Design and research',
    description: 'Blank canvas for grouping related sticky notes into labelled clusters.',
    w: 1200,
    h: 800,
    zones: [
      { x: 0, y: 0, w: 1200, h: 80, kind: 'header', label: 'Affinity Diagram — group related notes, then label each cluster', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 1200, h: 720, kind: 'region', fill: '#FFFFFF' },
    ],
  },

  // ---------------------------------------------------------------- Project planning
  {
    id: 'kanban-board',
    name: 'Kanban Board',
    category: 'Project planning',
    description: 'Sprint task board with backlog, to-do, in-progress and done lanes.',
    w: 1600,
    h: 800,
    zones: [
      { x: 0, y: 0, w: 1600, h: 80, kind: 'header', label: 'Kanban Board', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 400, h: 720, kind: 'lane', label: 'Backlog', fill: '#F1F5F9' },
      { x: 400, y: 80, w: 400, h: 720, kind: 'lane', label: 'To Do', fill: '#DBEAFE' },
      { x: 800, y: 80, w: 400, h: 720, kind: 'lane', label: 'In Progress', fill: '#FEF9C3' },
      { x: 1200, y: 80, w: 400, h: 720, kind: 'lane', label: 'Done', fill: '#DCFCE7' },
    ],
  },
  {
    id: 'daily-standup',
    name: 'Daily Stand-up',
    category: 'Project planning',
    description: 'Yesterday, today and blockers — one column each for a quick team sync.',
    w: 1200,
    h: 700,
    zones: [
      { x: 0, y: 0, w: 1200, h: 80, kind: 'header', label: 'Daily Stand-up', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 400, h: 620, kind: 'region', label: 'Yesterday', fill: '#DBEAFE' },
      { x: 400, y: 80, w: 400, h: 620, kind: 'region', label: 'Today', fill: '#DCFCE7' },
      { x: 800, y: 80, w: 400, h: 620, kind: 'region', label: 'Blockers', fill: '#FEE2E2' },
    ],
  },
  {
    id: 'project-milestones',
    name: 'Project Milestones',
    category: 'Project planning',
    description: 'A horizontal timeline spine with milestone markers placed along it.',
    w: 1600,
    h: 400,
    zones: [
      { x: 0, y: 0, w: 1600, h: 80, kind: 'header', label: 'Project Milestones', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 1600, h: 80, kind: 'lane', label: 'Timeline', fill: '#F1F5F9' },
      { x: 40, y: 200, w: 320, h: 180, kind: 'region', label: 'Milestone 1', fill: '#DBEAFE' },
      { x: 440, y: 200, w: 320, h: 180, kind: 'region', label: 'Milestone 2', fill: '#DCFCE7' },
      { x: 840, y: 200, w: 320, h: 180, kind: 'region', label: 'Milestone 3', fill: '#FEF9C3' },
      { x: 1240, y: 200, w: 320, h: 180, kind: 'region', label: 'Milestone 4', fill: '#EDE9FE' },
    ],
  },
  {
    id: 'project-kickoff',
    name: 'Project Kickoff',
    category: 'Project planning',
    description: 'Define goals, scope, roles, timeline, risks and success metrics before work starts.',
    w: 1200,
    h: 980,
    zones: [
      { x: 0, y: 0, w: 1200, h: 80, kind: 'header', label: 'Project Kickoff', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 600, h: 300, kind: 'region', label: 'Goals', fill: '#DBEAFE' },
      { x: 600, y: 80, w: 600, h: 300, kind: 'region', label: 'Scope', fill: '#DCFCE7' },
      { x: 0, y: 380, w: 600, h: 300, kind: 'region', label: 'Team & Roles', fill: '#FEF9C3' },
      { x: 600, y: 380, w: 600, h: 300, kind: 'region', label: 'Timeline', fill: '#EDE9FE' },
      { x: 0, y: 680, w: 600, h: 300, kind: 'region', label: 'Risks', fill: '#FEE2E2' },
      { x: 600, y: 680, w: 600, h: 300, kind: 'region', label: 'Success Metrics', fill: '#FFEDD5' },
    ],
  },

  // ---------------------------------------------------------------- Problem solving
  {
    id: 'flowchart-basic',
    name: 'Basic Flowchart',
    category: 'Problem solving',
    description: 'Start, process steps, a decision, and an end — a minimal vertical flow.',
    w: 400,
    h: 920,
    zones: [
      { x: 0, y: 0, w: 400, h: 120, kind: 'header', label: 'Start', fill: '#DCFCE7' },
      { x: 0, y: 160, w: 400, h: 160, kind: 'region', label: 'Process step', fill: '#DBEAFE' },
      { x: 0, y: 360, w: 400, h: 200, kind: 'region', label: 'Decision?', fill: '#FEF9C3' },
      { x: 0, y: 600, w: 400, h: 160, kind: 'region', label: 'Process step', fill: '#DBEAFE' },
      { x: 0, y: 800, w: 400, h: 120, kind: 'header', label: 'End', fill: '#FEE2E2' },
    ],
  },
  {
    // Real fishbone/Ishikawa diagrams rely on diagonal cause-lines, which
    // don't map to axis-aligned zones; 5 Whys is the standard root-cause
    // format that actually reduces to a clean linear grid.
    id: 'five-whys',
    name: '5 Whys',
    category: 'Problem solving',
    description: 'A problem statement, five rounds of "why?", and the root cause it converges on.',
    w: 1840,
    h: 300,
    zones: [
      { x: 0, y: 0, w: 240, h: 300, kind: 'header', label: 'Problem statement', fill: '#FEE2E2' },
      { x: 260, y: 0, w: 240, h: 300, kind: 'region', label: 'Why? #1', fill: '#FFEDD5' },
      { x: 520, y: 0, w: 240, h: 300, kind: 'region', label: 'Why? #2', fill: '#FFEDD5' },
      { x: 780, y: 0, w: 240, h: 300, kind: 'region', label: 'Why? #3', fill: '#FFEDD5' },
      { x: 1040, y: 0, w: 240, h: 300, kind: 'region', label: 'Why? #4', fill: '#FFEDD5' },
      { x: 1300, y: 0, w: 240, h: 300, kind: 'region', label: 'Why? #5', fill: '#FFEDD5' },
      { x: 1560, y: 0, w: 280, h: 300, kind: 'header', label: 'Root cause', fill: '#DCFCE7' },
    ],
  },

  // ---------------------------------------------------------------- Learning
  {
    id: 'kwl-chart',
    name: 'KWL Chart',
    category: 'Learning',
    description: 'Know, Wonder, Learned — a three-column chart for guiding a lesson.',
    w: 1200,
    h: 700,
    zones: [
      { x: 0, y: 0, w: 1200, h: 80, kind: 'header', label: 'KWL Chart', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 400, h: 620, kind: 'region', label: 'Know', fill: '#DBEAFE' },
      { x: 400, y: 80, w: 400, h: 620, kind: 'region', label: 'Wonder', fill: '#FEF9C3' },
      { x: 800, y: 80, w: 400, h: 620, kind: 'region', label: 'Learned', fill: '#DCFCE7' },
    ],
  },
  {
    // A true Venn diagram needs overlapping circles; approximated as the
    // same three-way split laid out as columns instead.
    id: 'compare-contrast',
    name: 'Compare and Contrast',
    category: 'Learning',
    description: 'What is unique to each side, and what the two have in common.',
    w: 1200,
    h: 700,
    zones: [
      { x: 0, y: 0, w: 1200, h: 80, kind: 'header', label: 'Compare and Contrast', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 440, h: 620, kind: 'region', label: 'Only A', fill: '#DBEAFE' },
      { x: 440, y: 80, w: 320, h: 620, kind: 'region', label: 'Both', fill: '#EDE9FE' },
      { x: 760, y: 80, w: 440, h: 620, kind: 'region', label: 'Only B', fill: '#DCFCE7' },
    ],
  },

  // ---------------------------------------------------------------- Workshop
  {
    id: 'effective-meeting',
    name: 'Effective Meeting',
    category: 'Workshop',
    description: 'Objectives, agenda, notes and action items on one page.',
    w: 1000,
    h: 800,
    zones: [
      { x: 0, y: 0, w: 1000, h: 80, kind: 'header', label: 'Effective Meeting', fill: '#EEF2FF' },
      { x: 0, y: 80, w: 500, h: 360, kind: 'region', label: 'Objectives', fill: '#DBEAFE' },
      { x: 500, y: 80, w: 500, h: 360, kind: 'region', label: 'Agenda', fill: '#FEF9C3' },
      { x: 0, y: 440, w: 500, h: 360, kind: 'region', label: 'Notes', fill: '#F1F5F9' },
      { x: 500, y: 440, w: 500, h: 360, kind: 'region', label: 'Action Items', fill: '#DCFCE7' },
    ],
  },

  // ---------------------------------------------------------------- Icebreaker
  {
    // The template's identity in MS is mostly the game mechanic and cartoon
    // avatars, not a structural layout — this just gives each player a slot.
    id: 'two-truths-one-lie',
    name: 'Two Truths and a Lie',
    category: 'Icebreaker',
    description: 'One card per player with three statements; the group guesses the lie.',
    w: 1200,
    h: 800,
    zones: [
      { x: 0, y: 0, w: 1200, h: 80, kind: 'header', label: 'Two Truths and a Lie — guess the lie on each card', fill: '#EEF2FF' },
      { x: 40, y: 100, w: 360, h: 300, kind: 'region', label: 'Player card', fill: '#DBEAFE' },
      { x: 420, y: 100, w: 360, h: 300, kind: 'region', label: 'Player card', fill: '#DCFCE7' },
      { x: 800, y: 100, w: 360, h: 300, kind: 'region', label: 'Player card', fill: '#FEF9C3' },
      { x: 40, y: 420, w: 360, h: 300, kind: 'region', label: 'Player card', fill: '#FCE7F3' },
      { x: 420, y: 420, w: 360, h: 300, kind: 'region', label: 'Player card', fill: '#FFEDD5' },
      { x: 800, y: 420, w: 360, h: 300, kind: 'region', label: 'Player card', fill: '#EDE9FE' },
    ],
  },
]
