import type { Stroke, TextItem, ZoneItem } from './canvas/types'

export interface BoardMeta {
  id: string
  title: string
  folder_id: string | null
  created_at: number
  updated_at: number
}

export interface Folder {
  id: string
  name: string
  parent_id: string | null
  created_at: number
}

export interface BoardDoc {
  version: 1
  strokes: Stroke[]
  texts: TextItem[]
  /** Template backdrops. Absent on documents saved before templates existed. */
  zones?: ZoneItem[]
}

export const EMPTY_DOC: BoardDoc = { version: 1, strokes: [], texts: [], zones: [] }

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  })
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${input} failed: ${res.status}`)
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const api = {
  listBoards: () => json<BoardMeta[]>('/api/boards'),
  createBoard: (body: { title?: string; folder_id?: string | null } = {}) =>
    json<BoardMeta>('/api/boards', { method: 'POST', body: JSON.stringify(body) }),
  updateBoard: (id: string, body: { title?: string; folder_id?: string | null }) =>
    json<BoardMeta>(`/api/boards/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteBoard: (id: string) => json<void>(`/api/boards/${id}`, { method: 'DELETE' }),

  getDoc: (id: string) => json<BoardDoc>(`/api/boards/${id}/doc`),
  putDoc: (id: string, doc: BoardDoc) =>
    json<void>(`/api/boards/${id}/doc`, { method: 'PUT', body: JSON.stringify(doc) }),
  putThumb: (id: string, png: Blob) =>
    fetch(`/api/boards/${id}/thumb`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    }),

  listFolders: () => json<Folder[]>('/api/folders'),
  createFolder: (body: { name?: string; parent_id?: string | null } = {}) =>
    json<Folder>('/api/folders', { method: 'POST', body: JSON.stringify(body) }),
  updateFolder: (id: string, body: { name?: string; parent_id?: string | null }) =>
    json<Folder>(`/api/folders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteFolder: (id: string) => json<void>(`/api/folders/${id}`, { method: 'DELETE' }),
}
