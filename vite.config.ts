import type { IncomingMessage } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Serve /api/jev during `npm run dev` with the same handler Vercel runs in
 * production, so TYPESAFE_API_KEY in .env.local works without `vercel dev`.
 */
function jevDevApi(env: Record<string, string>): Plugin {
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => resolve(body))
      req.on('error', reject)
    })

  return {
    name: 'jev-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/jev', async (req, res) => {
        try {
          const { handleJev } = (await server.ssrLoadModule('/server/jevHandler.ts')) as typeof import('./server/jevHandler')
          const method = req.method ?? 'GET'
          const request = new Request(`http://${req.headers.host ?? 'localhost'}/api/jev`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method === 'GET' || method === 'HEAD' ? undefined : await readBody(req),
          })
          const response = await handleJev(request, env)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(await response.text())
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'dev api failed' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // '' prefix: also load non-VITE_ vars (server-only; never exposed to client code).
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), jevDevApi(env)],
    build: {
      // VexFlow ships its music fonts inline; it is big by nature.
      chunkSizeWarningLimit: 1600,
    },
  }
})
