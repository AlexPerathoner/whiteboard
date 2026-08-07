import Fastify from 'fastify'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerRoutes } from './routes.ts'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'
const DIST = join(process.cwd(), 'dist')

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'warn' },
  // Board documents are a single JSON blob; the default 1MB cap is too small
  // for a densely inked board.
  bodyLimit: 64 * 1024 * 1024,
})

// Thumbnails arrive as raw PNG bytes, which Fastify has no default parser for.
app.addContentTypeParser('image/png', { parseAs: 'buffer' }, (_req, body, done) =>
  done(null, body),
)

await registerRoutes(app)

// In production the same process serves the built frontend, so a self-host is
// one container and one port. In dev, Vite serves it and proxies /api here.
if (existsSync(DIST)) {
  const { default: fastifyStatic } = await import('@fastify/static')
  await app.register(fastifyStatic, { root: DIST })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' })
    return reply.sendFile('index.html') // client-side routes
  })
}

await app.listen({ port: PORT, host: HOST })
// No authentication by design: this is a local, single-user board. Anything
// reachable beyond a trusted network needs a reverse proxy in front of it.
console.log(`whiteboard server on http://${HOST}:${PORT}`)
