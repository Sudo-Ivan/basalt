import http from 'node:http'
import { AddressInfo } from 'node:net'
import JSZip from 'jszip'

export type FakeServer = {
  url: string
  close: () => Promise<void>
  requests: { method: string; url: string; body?: unknown }[]
  force401: Set<string>
  force500: Set<string>
  token: { accessToken: string; refreshToken: string; expiration: string }
  games: unknown[]
  truncateDownloads: boolean
  slowMs: number
  unauthenticatedUploads: { url: string }[]
}

/**
 * Emulates the real LANCommander minimal API: camelCase JSON, numeric
 * enums and the same envelope shapes.
 */
export async function startFakeServer(
  options: {
    games?: unknown[]
    zipEntries?: Record<string, string>
  } = {}
): Promise<FakeServer> {
  const requests: FakeServer['requests'] = []
  const unauthenticatedUploads: { url: string }[] = []
  const force401 = new Set<string>()
  const force500 = new Set<string>()
  const token = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiration: new Date(Date.now() + 3600_000).toISOString()
  }
  const games = options.games ?? []
  const zipEntries = options.zipEntries ?? { 'game.exe': 'MZ fake' }

  const zipBuffer = await (async () => {
    const zip = new JSZip()
    for (const [name, content] of Object.entries(zipEntries)) {
      zip.file(name, content)
    }
    return zip.generateAsync({ type: 'nodebuffer' })
  })()

  let truncateDownloads = false
  let slowMs = 0

  const server = http.createServer((req, res) => {
    const url = req.url ?? ''
    const bodyChunks: Buffer[] = []
    req.on('data', (chunk) => bodyChunks.push(chunk))
    req.on('end', async () => {
      if (slowMs) {
        await new Promise((r) => setTimeout(r, slowMs))
      }
      const body = Buffer.concat(bodyChunks)
      let parsedBody: unknown
      try {
        parsedBody = JSON.parse(body.toString())
      } catch {
        parsedBody = undefined
      }
      requests.push({ method: req.method ?? '', url, body: parsedBody })

      const route = url.split('?')[0]
      if (force401.has(route)) {
        res.writeHead(401).end()
        return
      }
      if (force500.has(route)) {
        res.writeHead(500).end('error')
        return
      }

      const json = (data: unknown, code = 200) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      }

      // unauthenticated protected upload check
      if (route.includes('/Upload')) {
        const auth = req.headers['authorization']
        if (!auth || !auth.startsWith('Bearer ')) {
          unauthenticatedUploads.push({ url })
          return res.writeHead(401).end()
        }
        return json({ id: 'save-1' })
      }

      if (route === '/api/Auth/Login') {
        const creds = parsedBody as { Username?: string; Password?: string }
        if (creds?.Username === 'user' && creds?.Password === 'pass') {
          return json(token)
        }
        return res.writeHead(400).end()
      }
      if (route === '/api/Auth/Refresh') {
        const sent = parsedBody as {
          RefreshToken?: string
          refreshToken?: string
        }
        if (
          sent?.RefreshToken === 'refresh-token' ||
          sent?.refreshToken === 'refresh-token'
        ) {
          return json({
            accessToken: 'access-token-2',
            refreshToken: 'refresh-token-2',
            expiration: new Date(Date.now() + 3600_000).toISOString()
          })
        }
        return res.writeHead(401).end()
      }
      if (route === '/api/Auth/Validate') return res.writeHead(200).end()
      if (route === '/api/Auth/Logout') return res.writeHead(200).end()
      if (route === '/api/Library/Games') return json(games)
      if (route === '/api/Games/game-1/Scripts') return json([])
      if (route === '/api/Games/game-1/Actions') return json([])
      const redistScripts = route.match(
        /^\/api\/Redistributables\/(.+)\/Scripts$/
      )
      if (redistScripts) return json([])
      if (route === '/api/Games/game-1/Download') {
        const headers: Record<string, string | number> = {
          'Content-Type': 'application/zip',
          'Content-Length': zipBuffer.length
        }
        res.writeHead(200, headers)
        return res.end(
          truncateDownloads ? zipBuffer.subarray(0, 10) : zipBuffer
        )
      }
      const updateMatch = route.match(/^\/api\/Games\/(.+)\/CheckForUpdate$/)
      if (updateMatch) return json(false)
      const startedMatch = route.match(
        /^\/api\/Games\/(.+)\/(Started|Stopped)$/
      )
      if (startedMatch) return json({})
      const keyMatch = route.match(
        /^\/api\/Keys\/(Allocate|GetAllocated)\/(.+)$/
      )
      if (keyMatch) return json({ value: 'KEY-1234' })
      const savesLatest = route.match(/^\/api\/Saves\/Game\/(.+)\/Latest$/)
      if (savesLatest) return res.writeHead(404).end()
      res.writeHead(404).end('not found')
    })
  })

  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as AddressInfo).port

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(() => r())),
    requests,
    force401,
    force500,
    token,
    games,
    unauthenticatedUploads,
    get truncateDownloads() {
      return truncateDownloads
    },
    set truncateDownloads(value: boolean) {
      truncateDownloads = value
    },
    get slowMs() {
      return slowMs
    },
    set slowMs(value: number) {
      slowMs = value
    }
  }
}
