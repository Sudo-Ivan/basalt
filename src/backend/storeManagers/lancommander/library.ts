import {
  ExecResult,
  GameInfo,
  InstallInfo,
  InstallPlatform
} from 'common/types'
import { LCArchive, LCGame } from 'common/types/lancommander'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { isOnline } from '../../online_monitor'
import { singleFlight } from 'backend/utils/singleFlight'
import { LibraryManager } from 'common/types/game_manager'
import {
  installedGamesStore,
  libraryStore,
  metadataStore
} from './electronStores'
import { LCUser } from './user'
import { lcGameToGameInfo } from './mapping'
import LCGameObject from './games'
import type { LaunchOption } from 'common/types'

const library: Map<string, GameInfo> = new Map()
const installedGames: Map<string, GameInfo['install']> = new Map()

export default class LCLibraryManager implements LibraryManager {
  private readonly gameCache: Map<string, LCGameObject> = new Map()

  async init() {
    this.refreshInstalled()
    for (const game of libraryStore.get('games', [])) {
      library.set(game.app_name, game)
    }
    this.refresh().catch((error) => {
      logError(
        ['Failed to refresh LANCommander library on init:', error],
        LogPrefix.LANCommander
      )
    })
  }

  getGame(id: string): LCGameObject {
    const cached = this.gameCache.get(id)
    if (cached) return cached
    const game = new LCGameObject(id)
    this.gameCache.set(id, game)
    return game
  }

  async refresh(): Promise<ExecResult | null> {
    return singleFlight('lancommander-refresh', () => this.doRefresh())
  }

  private async doRefresh(): Promise<ExecResult | null> {
    const defaultResult = { stdout: '', stderr: '' }

    this.refreshInstalled()

    if (!LCUser.isLoggedInSync()) {
      return defaultResult
    }
    if (!isOnline()) {
      logWarning(
        'App offline, keeping cached LANCommander library',
        LogPrefix.LANCommander
      )
      return defaultResult
    }

    const serverUrl = LCUser.serverUrl()
    if (!serverUrl) {
      return defaultResult
    }

    let games: LCGame[]
    try {
      const response = await LCUser.request<LCGame[]>(
        'get',
        '/api/Library/Games'
      )
      games = Array.isArray(response.data) ? response.data : []
    } catch (error) {
      logError(
        ['Failed to get LANCommander library:', String(error)],
        LogPrefix.LANCommander
      )
      return defaultResult
    }

    const gamesObjects: GameInfo[] = []
    for (const lcGame of games) {
      const unifiedObject = lcGameToGameInfo(lcGame, serverUrl)
      if (!unifiedObject.app_name) continue

      const oldData = library.get(unifiedObject.app_name)
      if (oldData) {
        unifiedObject.folder_name = oldData.folder_name
      }

      const copyObject = Object.assign({}, unifiedObject)
      const installedInfo = installedGames.get(unifiedObject.app_name)
      if (installedInfo) {
        copyObject.is_installed = true
        copyObject.install = installedInfo
      }
      gamesObjects.push(unifiedObject)
      library.set(unifiedObject.app_name, copyObject)
    }

    libraryStore.set('games', gamesObjects)
    logInfo(
      ['LANCommander library updated, got', `${gamesObjects.length}`, 'games'],
      LogPrefix.LANCommander
    )
    return defaultResult
  }

  refreshInstalled() {
    installedGames.clear()
    for (const info of installedGamesStore.get('installed', [])) {
      if (info?.appName) {
        installedGames.set(info.appName, info)
      }
    }
  }

  getGameInfo(appName: string): GameInfo | undefined {
    const info = library.get(appName)
    if (info) {
      const installedInfo = installedGames.get(appName)
      if (installedInfo) {
        return { ...info, is_installed: true, install: installedInfo }
      }
      return info
    }
    return undefined
  }

  async getRemoteGame(appName: string): Promise<LCGame | undefined> {
    try {
      const response = await LCUser.request<LCGame>(
        'get',
        `/api/Games/${appName}`
      )
      return response.data ?? undefined
    } catch (error) {
      logError(
        [`Failed to get LANCommander game ${appName}:`, String(error)],
        LogPrefix.LANCommander
      )
      return undefined
    }
  }

  async getScripts(appName: string) {
    try {
      const response = await LCUser.request<LCGame['Scripts']>(
        'get',
        `/api/Games/${appName}/Scripts`
      )
      return response.data ?? []
    } catch {
      return []
    }
  }

  async getActions(appName: string) {
    try {
      const response = await LCUser.request<LCGame['Actions']>(
        'get',
        `/api/Games/${appName}/Actions`
      )
      return response.data ?? []
    } catch {
      return []
    }
  }

  async getManifest(appName: string): Promise<LCGame | undefined> {
    try {
      const response = await LCUser.request<LCGame>(
        'get',
        `/api/Games/${appName}/Manifest`
      )
      return response.data ?? undefined
    } catch {
      return undefined
    }
  }

  async getArchives(appName: string): Promise<LCArchive[]> {
    const game = await this.getRemoteGame(appName)
    return game?.Archives ?? []
  }

  async getInstallInfo(
    appName: string,
    _installPlatform: InstallPlatform,
    _options?: {
      branch?: string
      build?: string
      lang?: string
      retries?: number
    }
  ): Promise<InstallInfo | undefined> {
    void _installPlatform
    void _options
    const archives = await this.getArchives(appName)
    const latest = archives.at(-1)
    if (!latest) {
      logWarning(
        `No LANCommander archive for ${appName}`,
        LogPrefix.LANCommander
      )
      return undefined
    }
    return {
      game: { app_name: appName, runner: 'lancommander' },
      metadata: { version: latest.Version ?? '' },
      manifest: {
        download_size: latest.CompressedSize ?? 0,
        disk_size: latest.UncompressedSize ?? 0
      }
    } as unknown as InstallInfo
  }

  async listUpdateableGames(): Promise<string[]> {
    if (!LCUser.isLoggedInSync() || !isOnline()) {
      return []
    }
    const updateable: string[] = []
    for (const info of installedGamesStore.get('installed', [])) {
      if (!info?.appName) continue
      const metadata = metadataStore.get(info.appName)
      try {
        const query = `version=${encodeURIComponent(metadata?.version ?? info.version ?? '')}${metadata?.versionId ? `&versionId=${metadata.versionId}` : ''}`
        const response = await LCUser.request<boolean>(
          'get',
          `/api/Games/${info.appName}/CheckForUpdate?${query}`
        )
        if (response.data === true) {
          updateable.push(info.appName)
        }
      } catch (error) {
        logWarning(
          [`Update check failed for ${info.appName}:`, String(error)],
          LogPrefix.LANCommander
        )
      }
    }
    return updateable
  }

  async changeGameInstallPath(appName: string, newPath: string) {
    const installed = installedGamesStore.get('installed', [])
    const entry = installed.find((i) => i.appName === appName)
    if (entry) {
      entry.install_path = newPath
      installedGamesStore.set('installed', installed)
      this.refreshInstalled()
    }
  }

  changeVersionPinnedStatus(appName: string, status: boolean) {
    const installed = installedGamesStore.get('installed', [])
    const entry = installed.find((i) => i.appName === appName)
    if (entry) {
      entry.pinnedVersion = status
      installedGamesStore.set('installed', installed)
    }
  }

  installState(appName: string, state: boolean) {
    const info = library.get(appName)
    if (info) {
      info.is_installed = state
      library.set(appName, info)
    }
  }

  getLaunchOptions(_appName: string): LaunchOption[] {
    void _appName
    return []
  }
}
