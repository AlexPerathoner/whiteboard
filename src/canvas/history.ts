export interface Command {
  /** Short description, useful for debugging and for a future history panel. */
  label: string
  do(): void
  undo(): void
}

/**
 * Linear undo stack. Commands own both directions, so undo never has to
 * reconstruct state by replaying from the beginning.
 */
export class History {
  private done: Command[] = []
  private undone: Command[] = []

  private limit: number
  private onChange: () => void

  constructor(limit = 200, onChange: () => void = () => {}) {
    this.limit = limit
    this.onChange = onChange
  }

  /** Runs the command and makes it undoable. Clears the redo branch. */
  push(cmd: Command) {
    cmd.do()
    this.done.push(cmd)
    if (this.done.length > this.limit) this.done.shift()
    this.undone.length = 0
    this.onChange()
  }

  undo() {
    const cmd = this.done.pop()
    if (!cmd) return false
    cmd.undo()
    this.undone.push(cmd)
    this.onChange()
    return true
  }

  redo() {
    const cmd = this.undone.pop()
    if (!cmd) return false
    cmd.do()
    this.done.push(cmd)
    this.onChange()
    return true
  }

  get canUndo() {
    return this.done.length > 0
  }

  get canRedo() {
    return this.undone.length > 0
  }

  clear() {
    this.done.length = 0
    this.undone.length = 0
    this.onChange()
  }
}
