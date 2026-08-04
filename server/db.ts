import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** Everything mutable lives under one directory, so a Docker volume covers it. */
export const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data')
export const DOCS_DIR = join(DATA_DIR, 'docs')
export const THUMBS_DIR = join(DATA_DIR, 'thumbs')

for (const dir of [DATA_DIR, DOCS_DIR, THUMBS_DIR]) mkdirSync(dir, { recursive: true })

export const db = new Database(join(DATA_DIR, 'whiteboard.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    parent_id  TEXT REFERENCES folders(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS boards (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    -- Deleting a folder keeps its boards; they fall back to the root.
    folder_id  TEXT REFERENCES folders(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS boards_folder ON boards(folder_id);
  CREATE INDEX IF NOT EXISTS folders_parent ON folders(parent_id);
`)

export interface BoardRow {
  id: string
  title: string
  folder_id: string | null
  created_at: number
  updated_at: number
}

export interface FolderRow {
  id: string
  name: string
  parent_id: string | null
  created_at: number
}

export const docPath = (id: string) => join(DOCS_DIR, `${id}.json`)
export const thumbPath = (id: string) => join(THUMBS_DIR, `${id}.png`)
