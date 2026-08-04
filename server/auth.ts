import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

/**
 * Optional HTTP Basic gate, enabled only when APP_PASSWORD is set.
 *
 * This is deliberately minimal, and it is *not* a substitute for TLS: Basic
 * credentials travel base64-encoded, not encrypted. It is meant for a board
 * running on a trusted LAN. Anything reachable from the internet should sit
 * behind a reverse proxy terminating HTTPS.
 */
export function registerAuth(app: FastifyInstance) {
  const password = process.env.APP_PASSWORD
  if (!password) return false

  const user = process.env.APP_USER ?? 'whiteboard'
  const expected = Buffer.from(`${user}:${password}`)

  app.addHook('onRequest', (req, reply, done) => {
    const header = req.headers.authorization ?? ''
    if (header.startsWith('Basic ')) {
      const given = Buffer.from(header.slice(6), 'base64')
      // Compare in constant time, and only when the lengths already match --
      // timingSafeEqual throws on a length mismatch.
      if (given.length === expected.length && timingSafeEqual(given, expected)) return done()
    }
    reply
      .code(401)
      .header('WWW-Authenticate', 'Basic realm="Whiteboard", charset="UTF-8"')
      .send({ error: 'unauthorized' })
  })

  return true
}
