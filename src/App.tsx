import { Board } from './board/Board'
import { Dashboard } from './dashboard/Dashboard'
import { boardIdFromPath, usePath } from './router'

export default function App() {
  const path = usePath()
  const boardId = boardIdFromPath(path)
  // `key` remounts the board when the id changes, so no stale document or
  // undo stack can survive a navigation between boards.
  return boardId ? <Board key={boardId} boardId={boardId} /> : <Dashboard />
}
