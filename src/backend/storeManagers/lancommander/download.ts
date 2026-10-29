import { createWriteStream, existsSync, mkdirSync } from 'graceful-fs'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import unzipper from 'unzipper'
import { randomUUID } from 'node:crypto'
import { logError, LogPrefix } from 'backend/logger'
import { LCUser } from './user'

export type DownloadProgress = {
  bytesDownloaded: number
  totalBytes?: number
  percent?: number
  speed?: number
}

/**
 * Downloads the archive for a game (or a specific archive id) to a temp
 * file while reporting progress, then extracts every entry into
 * the destination with a zip-slip guard. Entries created during extraction
 * are removed again on failure/cancel unless the destination existed
 * before with those files already present.
 */
export async function downloadAndExtract(
  gameId: string,
  destination: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal,
  archiveId?: string,
  routeOverride?: string
): Promise<void> {
  const route =
    routeOverride ??
    (archiveId
      ? `/Download/Archive/${archiveId}`
      : `/api/Games/${gameId}/Download`)

  const response = await LCUser.request<NodeJS.ReadableStream>('get', route, {
    responseType: 'stream',
    timeout: 0
  })

  const totalBytes =
    Number(response.headers['content-length'] ?? 0) || undefined
  const tempFile = join(
    dirname(destination),
    `.lancommander-download-${randomUUID()}.zip`
  )
  const createdFiles: string[] = []
  const destinationExisted = existsSync(destination)

  mkdirSync(destination, { recursive: true })

  let downloaded = 0
  let lastReport = Date.now()
  const startedAt = Date.now()
  const stream = response.data as unknown as import('node:stream').Readable

  try {
    stream.on('data', (chunk: Buffer) => {
      downloaded += chunk.length
      const now = Date.now()
      if (now - lastReport > 250) {
        lastReport = now
        onProgress({
          bytesDownloaded: downloaded,
          totalBytes,
          percent: totalBytes
            ? Math.round((downloaded * 100) / totalBytes)
            : undefined,
          speed: downloaded / Math.max(1, (now - startedAt) / 1000)
        })
      }
    })

    const abortHandler = () => {
      stream.destroy(new Error('aborted'))
    }
    signal.addEventListener('abort', abortHandler, { once: true })

    try {
      await pipeline(stream, createWriteStream(tempFile))
    } finally {
      signal.removeEventListener('abort', abortHandler)
    }

    if (signal.aborted) {
      throw new Error('Download aborted')
    }
    if (totalBytes && downloaded < totalBytes) {
      throw new Error(
        `Truncated download: got ${downloaded} of ${totalBytes} bytes`
      )
    }

    onProgress({ bytesDownloaded: downloaded, totalBytes, percent: 100 })

    // Parse and extract the zip one entry at a time
    const directory = await unzipper.Open.file(tempFile)
    for (const entry of directory.files) {
      if (signal.aborted) {
        throw new Error('Extraction aborted')
      }
      const entryPath = normalize(join(destination, entry.path))
      const resolvedDestination = normalize(destination) + sep
      if (!entryPath.startsWith(resolvedDestination)) {
        throw new Error(`Unsafe archive entry: ${entry.path}`)
      }
      if (entry.type === 'Directory') {
        await mkdir(entryPath, { recursive: true })
        continue
      }
      await mkdir(dirname(entryPath), { recursive: true })
      if (!existsSync(entryPath)) {
        createdFiles.push(entryPath)
      }
      await pipeline(entry.stream(), createWriteStream(entryPath))
    }
  } catch (error) {
    for (const file of createdFiles) {
      await rm(file, { force: true }).catch(() => {})
    }
    if (!destinationExisted) {
      await rm(destination, { recursive: true, force: true }).catch(() => {})
    }
    logError(
      ['LANCommander download/extract failed:', String(error)],
      LogPrefix.LANCommander
    )
    throw error
  } finally {
    await rm(tempFile, { force: true }).catch(() => {})
  }
}
