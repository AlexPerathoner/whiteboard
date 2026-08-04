import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type BoardMeta, type Folder } from '../api'
import { navigate } from '../router'
import './dashboard.css'

/** MS's card subtitle format. */
function edited(ts: number) {
  const d = new Date(ts)
  return `Edited: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

/**
 * Inline single-field editor. Everything here uses one of these rather than
 * `prompt`/`confirm`: native dialogs block the whole page, and MS renames in
 * place anyway.
 */
function InlineInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      className="inline-input"
      defaultValue={initial}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') onCommit(e.currentTarget.value)
        if (e.key === 'Escape') onCancel()
      }}
    />
  )
}

export function Dashboard() {
  const [boards, setBoards] = useState<BoardMeta[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [submenu, setSubmenu] = useState<'none' | 'move' | 'delete'>('none')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newFolder, setNewFolder] = useState(false)
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [b, f] = await Promise.all([api.listBoards(), api.listFolders()])
      setBoards(b)
      setFolders(f)
      setError(null)
    } catch {
      setError('Cannot reach the server. Is it running on port 3001?')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const closeMenus = () => {
    setMenuFor(null)
    setSubmenu('none')
    setDeletingFolder(null)
  }

  const visible = boards.filter((b) => b.folder_id === folderId)

  const createBoard = async () => {
    const b = await api.createBoard({ folder_id: folderId })
    navigate(`/b/${b.id}`)
  }

  const act = async (fn: () => Promise<unknown>) => {
    closeMenus()
    setRenaming(null)
    await fn()
    void reload()
  }

  return (
    <div className="dashboard" onClick={closeMenus}>
      <header>
        <h1>Whiteboard</h1>
      </header>

      <div className="body">
        <aside className="folders">
          <button className={folderId === null ? 'on' : ''} onClick={() => setFolderId(null)}>
            All whiteboards
          </button>

          {folders.map((f) => (
            <div key={f.id} className="folder-row">
              <button className={folderId === f.id ? 'on' : ''} onClick={() => setFolderId(f.id)}>
                📁 {f.name}
              </button>
              {deletingFolder === f.id ? (
                <button
                  className="confirm"
                  onClick={(e) => {
                    e.stopPropagation()
                    void act(async () => {
                      await api.deleteFolder(f.id)
                      if (folderId === f.id) setFolderId(null)
                    })
                  }}
                >
                  Sure?
                </button>
              ) : (
                <button
                  className="folder-del"
                  title="Delete folder — its boards move back to the root"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeletingFolder(f.id)
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {newFolder ? (
            <InlineInput
              initial="New folder"
              onCancel={() => setNewFolder(false)}
              onCommit={(name) => {
                setNewFolder(false)
                if (name.trim()) void act(() => api.createFolder({ name }))
              }}
            />
          ) : (
            <button
              className="new-folder"
              onClick={(e) => {
                e.stopPropagation()
                setNewFolder(true)
              }}
            >
              + New folder
            </button>
          )}
        </aside>

        <main>
          {error && <p className="error">{error}</p>}
          <div className="grid">
            <button className="card new" onClick={createBoard}>
              <span className="plus">+</span>
              New Whiteboard
            </button>

            {visible.map((b) => (
              <div key={b.id} className="card">
                <div className="thumb" onClick={() => navigate(`/b/${b.id}`)}>
                  {/* Cache-busted per save so a stale thumbnail never sticks. */}
                  <img src={`/api/boards/${b.id}/thumb?v=${b.updated_at}`} alt="" />
                </div>
                <div className="meta">
                  <div className="titles" onClick={() => renaming !== b.id && navigate(`/b/${b.id}`)}>
                    {renaming === b.id ? (
                      <InlineInput
                        initial={b.title}
                        onCancel={() => setRenaming(null)}
                        onCommit={(title) => {
                          setRenaming(null)
                          if (title.trim() && title !== b.title) {
                            void act(() => api.updateBoard(b.id, { title }))
                          }
                        }}
                      />
                    ) : (
                      <strong>{b.title}</strong>
                    )}
                    <span>{edited(b.updated_at)}</span>
                  </div>

                  <button
                    className="more"
                    title="More"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSubmenu('none')
                      setMenuFor(menuFor === b.id ? null : b.id)
                    }}
                  >
                    ⋯
                  </button>

                  {menuFor === b.id && (
                    <div className="menu" onClick={(e) => e.stopPropagation()}>
                      {submenu === 'none' && (
                        <>
                          <button
                            onClick={() => {
                              closeMenus()
                              setRenaming(b.id)
                            }}
                          >
                            Rename
                          </button>
                          <button onClick={() => setSubmenu('move')}>Move to folder</button>
                          <button className="danger" onClick={() => setSubmenu('delete')}>
                            Delete
                          </button>
                        </>
                      )}

                      {submenu === 'move' && (
                        <>
                          <button
                            disabled={b.folder_id === null}
                            onClick={() => act(() => api.updateBoard(b.id, { folder_id: null }))}
                          >
                            All whiteboards
                          </button>
                          {folders.map((f) => (
                            <button
                              key={f.id}
                              disabled={b.folder_id === f.id}
                              onClick={() => act(() => api.updateBoard(b.id, { folder_id: f.id }))}
                            >
                              📁 {f.name}
                            </button>
                          ))}
                          {folders.length === 0 && <span className="hint">No folders yet</span>}
                        </>
                      )}

                      {submenu === 'delete' && (
                        <>
                          <span className="hint">Delete “{b.title}” permanently?</span>
                          <button
                            className="danger"
                            onClick={() => act(() => api.deleteBoard(b.id))}
                          >
                            Yes, delete
                          </button>
                          <button onClick={() => setSubmenu('none')}>Cancel</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
