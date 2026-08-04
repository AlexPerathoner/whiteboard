import type { FastifyInstance } from 'fastify'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { db, docPath, thumbPath, type BoardRow, type FolderRow } from './db.ts'

const EMPTY_DOC = { version: 1, strokes: [], texts: [] }

function touch(id: string) {
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

function board(id: string): BoardRow | undefined {
  return db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as BoardRow | undefined
}

export function registerRoutes(app: FastifyInstance) {
  // --- boards --------------------------------------------------------------

  app.get('/api/boards', () =>
    db.prepare('SELECT * FROM boards ORDER BY updated_at DESC').all() as BoardRow[],
  )

  app.post<{ Body: { title?: string; folder_id?: string | null } }>('/api/boards', (req, reply) => {
    const now = Date.now()
    const row: BoardRow = {
      id: randomUUID(),
      title: req.body?.title?.trim() || 'Untitled',
      folder_id: req.body?.folder_id ?? null,
      created_at: now,
      updated_at: now,
    }
    db.prepare(
      'INSERT INTO boards (id, title, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(row.id, row.title, row.folder_id, row.created_at, row.updated_at)
    writeFileSync(docPath(row.id), JSON.stringify(EMPTY_DOC))
    reply.code(201)
    return row
  })

  app.patch<{ Params: { id: string }; Body: { title?: string; folder_id?: string | null } }>(
    '/api/boards/:id',
    (req, reply) => {
      const existing = board(req.params.id)
      if (!existing) return reply.code(404).send({ error: 'not found' })
      const title = req.body.title?.trim() || existing.title
      // `folder_id: null` means "move to root", so undefined is the only no-op.
      const folder = req.body.folder_id === undefined ? existing.folder_id : req.body.folder_id
      db.prepare('UPDATE boards SET title = ?, folder_id = ?, updated_at = ? WHERE id = ?').run(
        title,
        folder,
        Date.now(),
        req.params.id,
      )
      return board(req.params.id)
    },
  )

  app.delete<{ Params: { id: string } }>('/api/boards/:id', (req, reply) => {
    db.prepare('DELETE FROM boards WHERE id = ?').run(req.params.id)
    for (const p of [docPath(req.params.id), thumbPath(req.params.id)]) {
      if (existsSync(p)) unlinkSync(p)
    }
    return reply.code(204).send()
  })

  // --- document ------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/api/boards/:id/doc', (req, reply) => {
    if (!board(req.params.id)) return reply.code(404).send({ error: 'not found' })
    const p = docPath(req.params.id)
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : EMPTY_DOC
  })

  app.put<{ Params: { id: string }; Body: unknown }>('/api/boards/:id/doc', (req, reply) => {
    if (!board(req.params.id)) return reply.code(404).send({ error: 'not found' })
    // Whole-document write. Correct and simple for a single user; an op log is
    // only needed once two clients can edit the same board at once.
    writeFileSync(docPath(req.params.id), JSON.stringify(req.body))
    touch(req.params.id)
    return reply.code(204).send()
  })

  // --- thumbnail -----------------------------------------------------------

  app.put<{ Params: { id: string } }>('/api/boards/:id/thumb', (req, reply) => {
    if (!board(req.params.id)) return reply.code(404).send({ error: 'not found' })
    writeFileSync(thumbPath(req.params.id), req.body as Buffer)
    return reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>('/api/boards/:id/thumb', (req, reply) => {
    const p = thumbPath(req.params.id)
    if (!existsSync(p)) return reply.code(404).send()
    reply.header('Content-Type', 'image/png').header('Cache-Control', 'no-cache')
    return readFileSync(p)
  })

  // --- folders -------------------------------------------------------------

  app.get('/api/folders', () =>
    db.prepare('SELECT * FROM folders ORDER BY name').all() as FolderRow[],
  )

  app.post<{ Body: { name?: string; parent_id?: string | null } }>(
    '/api/folders',
    (req, reply) => {
      const row: FolderRow = {
        id: randomUUID(),
        name: req.body?.name?.trim() || 'New folder',
        parent_id: req.body?.parent_id ?? null,
        created_at: Date.now(),
      }
      db.prepare(
        'INSERT INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)',
      ).run(row.id, row.name, row.parent_id, row.created_at)
      reply.code(201)
      return row
    },
  )

  app.patch<{ Params: { id: string }; Body: { name?: string; parent_id?: string | null } }>(
    '/api/folders/:id',
    (req, reply) => {
      const existing = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id) as
        | FolderRow
        | undefined
      if (!existing) return reply.code(404).send({ error: 'not found' })
      if (req.body.parent_id === req.params.id) {
        return reply.code(400).send({ error: 'a folder cannot be its own parent' })
      }
      db.prepare('UPDATE folders SET name = ?, parent_id = ? WHERE id = ?').run(
        req.body.name?.trim() || existing.name,
        req.body.parent_id === undefined ? existing.parent_id : req.body.parent_id,
        req.params.id,
      )
      return db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id)
    },
  )

  app.delete<{ Params: { id: string } }>('/api/folders/:id', (req, reply) => {
    db.prepare('DELETE FROM folders WHERE id = ?').run(req.params.id)
    return reply.code(204).send()
  })
}
