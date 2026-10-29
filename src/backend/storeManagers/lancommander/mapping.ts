import { join, normalize, sep } from 'node:path'
import { GameInfo } from 'common/types'
import { LCGame } from 'common/types/lancommander'
import { mediaTypeName, savePathTypeName } from './enums'

/**
 * Maps a LANCommander SDK Game object onto a Basalt GameInfo.
 * Pure function for testability; serverUrl is used to build
 * absolute media URLs.
 */
export function lcGameToGameInfo(game: LCGame, serverUrl: string): GameInfo {
  const media = game.Media ?? []

  const mediaUrl = (type: string): string => {
    const candidates = media.filter((m) => mediaTypeName(m.Type) === type)
    if (!candidates.length) return ''
    const best = candidates.sort(
      (a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0)
    )[0]
    const url = `${serverUrl}/api/Media/${best.Id}/Download`
    return best.FileId ? `${url}?fileId=${best.FileId}` : url
  }

  const listNames = (items?: { Name?: string; Value?: string }[]): string[] =>
    (items ?? []).map((item) => item.Name ?? item.Value ?? '').filter(Boolean)

  const hasFileSavePaths = (game.SavePaths ?? []).some(
    (path) => savePathTypeName(path.Type) === 'File'
  )

  return {
    app_name: String(game.Id),
    runner: 'lancommander',
    title: game.Title || 'Untitled',
    folder_name: sanitizeFolderName(game.DirectoryName || game.Title || 'game'),
    developer: listNames(game.Developers).join(', '),
    description: game.Description ?? game.Notes ?? '',
    art_cover: mediaUrl('Cover') || mediaUrl('Grid') || mediaUrl('Icon'),
    art_square: mediaUrl('Icon') || mediaUrl('Grid') || mediaUrl('Cover'),
    art_background: mediaUrl('Background'),
    art_logo: mediaUrl('Logo'),
    cloud_save_enabled: hasFileSavePaths || undefined,
    is_installed: false,
    install: {},
    canRunOffline: true,
    extra: {
      about: {
        description: game.Description ?? '',
        shortDescription: game.Notes ?? ''
      },
      reqs: [],
      storeUrl: `${serverUrl}/Games/${game.Id}`,
      genres: listNames(game.Genres)
    },
    thirdPartyManagedApp: 'LANCommander'
  }
}

export function sanitizeFolderName(name: string): string {
  let sanitized = (name ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .replace(/^[\\/]+/, '')
    .trim()
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    sanitized = 'game'
  }
  return sanitized
}

/**
 * Resolves the install directory for a game inside a user chosen base
 * path and verifies it is strictly inside that base path.
 */
export function resolveInstallPath(
  basePath: string,
  folderName: string
): string {
  const safeName = sanitizeFolderName(folderName)
  const base = normalize(basePath)
  const resolved = normalize(join(base, safeName))
  if (resolved.startsWith(base + sep)) {
    return resolved
  }
  throw new Error(
    `Install path '${folderName}' is outside the install directory`
  )
}
