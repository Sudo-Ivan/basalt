import { existsSync } from 'graceful-fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import JSZip from 'jszip'
import unzipper from 'unzipper'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { LCGameSave, LCSavePath } from 'common/types/lancommander'
import { LCUser } from './user'
import { currentRuntimeFlag, privateScriptsDir } from './scripts'
import { savePathTypeName } from './enums'
import { syncStore } from './electronStores'

type SaveManifest = {
  Id: string
  Title?: string
  SavePaths?: LCSavePath[]
}

export const fileSavePaths = (paths?: LCSavePath[]): LCSavePath[] =>
  (paths ?? []).filter(
    (path) =>
      savePathTypeName(path.Type) === 'File' &&
      (!(path.Platforms ?? 0) ||
        ((path.Platforms ?? 0) & currentRuntimeFlag()) !== 0)
  )

const expandPath = (path: string, installDirectory: string): string =>
  path
    .replace(/%InstallDirectory%|{InstallDirectory}/gi, installDirectory)
    .replace(/%USERPROFILE%/gi, process.env.HOME ?? '')

async function collectFiles(baseDir: string): Promise<string[]> {
  if (!existsSync(baseDir)) return []
  const entries: string[] = []
  const walk = async (dir: string) => {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, item.name)
      if (item.isDirectory()) {
        await walk(full)
      } else {
        entries.push(full)
      }
    }
  }
  await walk(baseDir)
  return entries
}

/**
 * Packs local save files into the LANCommander save zip layout:
 * a manifest file plus Files/{savePathId}/{relativePath} entries.
 */
export async function packSaves(
  manifest: SaveManifest,
  installDirectory: string
): Promise<{ data: Buffer; fileCount: number }> {
  const zip = new JSZip()
  zip.file('Manifest.json', JSON.stringify(manifest))
  let fileCount = 0

  for (const savePath of fileSavePaths(manifest.SavePaths)) {
    const absolute = expandPath(savePath.Path, installDirectory)
    const stats = await stat(absolute).catch(() => null)
    if (!stats) continue

    const base = savePath.WorkingDirectory
      ? expandPath(savePath.WorkingDirectory, installDirectory)
      : stats.isDirectory()
        ? absolute
        : absolute.slice(0, absolute.lastIndexOf(sep))

    const files = stats.isDirectory()
      ? await collectFiles(absolute)
      : [absolute]
    for (const file of files) {
      const archivePath = `Files/${savePath.Id}/${relative(base, file).split(sep).join('/')}`
      zip.file(archivePath, await readFile(file))
      fileCount++
    }
  }

  const data = await zip.generateAsync({ type: 'nodebuffer' })
  return { data, fileCount }
}

/**
 * Restores a downloaded save zip into the local filesystem, mapping
 * Files/{savePathId} entries back through the manifest save paths.
 */
export async function unpackSaves(
  archivePath: string,
  manifest: SaveManifest,
  installDirectory: string
): Promise<void> {
  const directory = await unzipper.Open.file(archivePath)
  const savesDir = privateScriptsDir() || join(tmpdir(), `basalt-lc-`)
  const filesDir = join(savesDir, `lc-saves-${randomUUID()}`)
  await mkdir(filesDir, { recursive: true })

  try {
    await directory.extract({ path: filesDir })
    const entriesRoot = join(filesDir, 'Files')

    for (const savePath of fileSavePaths(manifest.SavePaths)) {
      const sourceDir = join(entriesRoot, String(savePath.Id))
      if (!existsSync(sourceDir)) continue
      const destination = expandPath(savePath.Path, installDirectory)
      const destStats = await stat(destination).catch(() => null)
      const isDirTarget =
        savePath.IsRegex || !destStats || destStats.isDirectory()
      for (const file of await collectFiles(sourceDir)) {
        const rel = relative(sourceDir, file)
        const target = isDirTarget
          ? join(destination, rel)
          : join(destination.slice(0, destination.lastIndexOf(sep)), rel)
        await mkdir(target.slice(0, target.lastIndexOf(sep)), {
          recursive: true
        })
        await writeFile(target, await readFile(file))
      }
    }
  } finally {
    const { rm } = await import('node:fs/promises')
    await rm(filesDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function getLatestSave(
  gameId: string
): Promise<LCGameSave | undefined> {
  try {
    const response = await LCUser.request<LCGameSave>(
      'get',
      `/api/Saves/Game/${gameId}/Latest`
    )
    return response.data ?? undefined
  } catch {
    return undefined
  }
}

export async function downloadLatestSave(
  manifest: SaveManifest,
  installDirectory: string
): Promise<boolean> {
  const gameId = manifest.Id
  const latest = await getLatestSave(gameId)
  if (!latest) return false

  const lastSync = syncStore.get_nodefault(gameId)?.latest ?? ''
  if (latest.CreatedOn && lastSync && latest.CreatedOn <= lastSync) {
    return false
  }

  try {
    const response = await LCUser.request<NodeJS.ReadableStream>(
      'get',
      `/api/Saves/Game/${gameId}/Latest/Download`,
      { responseType: 'stream', timeout: 0 }
    )
    const savesDir =
      privateScriptsDir() || join(tmpdir(), `basalt-lc-${randomUUID()}`)
    await mkdir(savesDir, { recursive: true, mode: 0o700 })
    const tempPath = join(savesDir, `lc-save-${randomUUID()}.zip`)
    const { createWriteStream } = await import('graceful-fs')
    const { pipeline } = await import('node:stream/promises')
    await pipeline(response.data, createWriteStream(tempPath))
    await unpackSaves(tempPath, manifest, installDirectory)
    if (latest.CreatedOn) {
      syncStore.set(gameId, { latest: latest.CreatedOn })
    }
    return true
  } catch (error) {
    logError(
      [`Failed to download save for game ${gameId}:`, String(error)],
      LogPrefix.LANCommander
    )
    return false
  }
}

export async function uploadSave(
  manifest: SaveManifest,
  installDirectory: string
): Promise<boolean> {
  const { data: buffer, fileCount } = await packSaves(
    manifest,
    installDirectory
  )
  if (fileCount === 0) {
    logInfo(
      `No save files to upload for game ${manifest.Id}, skipping`,
      LogPrefix.LANCommander
    )
    return false
  }
  const runtime = isWindowsRuntime()
    ? 'Windows'
    : isMacRuntime()
      ? 'macOS'
      : 'Linux'
  const boundary = `----basalt${randomUUID()}`
  const fileName = `game-${manifest.Id}-save`

  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: application/zip\r\n\r\n`
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([head, buffer, tail])

  await LCUser.request(
    'post',
    `/api/Saves/Game/${manifest.Id}/Upload?platform=${runtime}`,
    {
      data: body,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      timeout: 0
    }
  )

  syncStore.set(manifest.Id, { latest: new Date().toISOString() })
  logInfo(`Uploaded save for game ${manifest.Id}`, LogPrefix.LANCommander)
  return true
}

function isWindowsRuntime(): boolean {
  return currentRuntimeFlag() === 1
}
function isMacRuntime(): boolean {
  return currentRuntimeFlag() === 4
}
