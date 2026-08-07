import { useEffect, useState } from 'react'

export type SaveState = 'idle' | 'saving' | 'error'

/** Coarse relative time; the badge never needs more precision than this. */
function ago(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

/**
 * The save indicator, split out of the board so its once-a-second tick
 * re-renders this subtree alone -- inside `Board` it would repaint the canvas
 * host and every DOM item, including mid-stroke.
 */
export function SaveBadge({
  saveState,
  lastSavedAt,
  unsaved,
}: {
  saveState: SaveState
  lastSavedAt: number | null
  unsaved: boolean
}) {
  const [tick, setTick] = useState(0)
  // Only the relative label moves; the other states are static text.
  const live = saveState === 'idle' && !unsaved && lastSavedAt !== null

  useEffect(() => {
    if (!live) return
    // Re-scheduled per tick rather than a fixed interval, so the beat can drop
    // to once every 30s past the first minute when the label stops changing.
    const age = Date.now() - lastSavedAt!
    const id = setTimeout(() => setTick((n) => n + 1), age < 60_000 ? 1000 : 30_000)
    return () => clearTimeout(id)
  }, [live, lastSavedAt, tick])

  const [kind, text] =
    saveState === 'saving'
      ? ['saving', 'Saving…']
      : saveState === 'error'
        ? ['error', 'Save failed']
        : unsaved
          ? ['unsaved', 'Unsaved changes']
          : lastSavedAt !== null
            ? ['idle', `Saved ${ago(Date.now() - lastSavedAt)}`]
            : ['idle', 'Saved']

  return <span className={`save save-${kind}`}>{text}</span>
}
