import { existsSync, mkdirSync, rmSync } from 'graceful-fs'
import { dirname, join, resolve } from 'node:path'
import { writeFile, readFile } from 'node:fs/promises'
import { networkInterfaces, hostname } from 'node:os'
import { GameConfig } from '../../game_config'
import { Game, InstallResult, RemoveArgs } from 'common/types/game_manager'
import {
  ExecResult,
  ExtraInfo,
  GameInfo,
  InstallArgs,
  InstallPlatform,
  LaunchOption
} from 'common/types'
import { LCRedistributable } from 'common/types/lancommander'
import { logError, logWarning, LogPrefix } from 'backend/logger'
import {
  sendGameStatusUpdate,
  sendProgressUpdate,
  getFileSize
} from '../../utils'
import { launchGame } from '../storeManagerCommon/games'
import {
  addShortcuts as addShortcutsUtil,
  removeShortcuts as removeShortcutsUtil
} from '../../shortcuts/shortcuts/shortcuts'
import { removeNonSteamGame } from '../../shortcuts/nonesteamgame/nonesteamgame'
import { removePrefix } from '../../utils/uninstaller'
import { removeRecentGame } from '../../recent_games/recent_games'
import {
  createAbortController,
  deleteAbortController
} from '../../utils/aborthandler/aborthandler'
import { notify } from '../../dialog/dialog'
import i18next from 'i18next'
import { isWindows } from 'backend/constants/environment'
import { libraryManagerMap } from '..'
import { installedGamesStore, metadataStore, syncStore } from './electronStores'
import { LCUser } from './user'
import { downloadAndExtract } from './download'
import { pickHostScript, resolvePwsh, runLCScript } from './scripts'
import { downloadLatestSave, uploadSave } from './saves'
import { LC_METADATA_DIR } from './constants'
import { pickAction } from './actions'
import { resolveInstallPath } from './mapping'

import type LogWriter from 'backend/logger/log_writer'

const metadataDir = (installPath: string, gameId: string) =>
  join(installPath, LC_METADATA_DIR, gameId)

async function writeInstallMetadata(
  installPath: string,
  gameId: string,
  manifest: object
) {
  const dir = metadataDir(installPath, gameId)
  mkdirSync(dir, { recursive: true })
  await writeFile(
    join(dir, 'Manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  )
}

export default class LCGameObject implements Game {
  private readonly id: string

  constructor(id: string) {
    this.id = id
  }

  getGameInfo(): GameInfo {
    const info = libraryManagerMap['lancommander'].getGameInfo(this.id)
    if (!info) {
      return {
        app_name: this.id,
        runner: 'lancommander',
        art_cover: '',
        art_square: '',
        install: {},
        is_installed: false,
        title: '',
        canRunOffline: true
      }
    }
    return info
  }

  async getSettings() {
    return (
      GameConfig.get(this.id).config ||
      (await GameConfig.get(this.id).getSettings())
    )
  }

  async getExtraInfo(): Promise<ExtraInfo> {
    const info = this.getGameInfo()
    const metadata = metadataStore.get(this.id)
    const extra: ExtraInfo = {
      about: info.extra?.about ?? { description: '', shortDescription: '' },
      reqs: [],
      storeUrl: info.extra?.storeUrl,
      genres: info.extra?.genres ?? []
    }
    if (metadata?.key) {
      ;(extra as unknown as Record<string, unknown>).key = metadata.key
    }
    if (metadata?.redistributables?.length) {
      ;(extra as unknown as Record<string, unknown>).redistributables =
        metadata.redistributables
    }
    return extra
  }

  async importGame(): Promise<ExecResult> {
    return { stdout: '', stderr: 'Not supported' }
  }

  onInstallOrUpdateOutput(
    action: 'installing' | 'updating',
    data: string,
    totalDownloadSize: number
  ) {
    const percent = Math.min(100, parseInt(data) || 0)
    sendProgressUpdate({
      appName: this.id,
      runner: 'lancommander',
      status: action,
      progress: {
        percent,
        bytes: getFileSize(totalDownloadSize),
        eta: 'N/A',
        downSpeed: 0,
        diskSpeed: 0
      }
    })
  }

  private async fetchGame() {
    return libraryManagerMap['lancommander'].getRemoteGame(this.id)
  }

  private scriptVariables(installPath: string, manifestPath: string) {
    return {
      InstallDirectory: installPath,
      GameManifest: manifestPath,
      DefaultInstallDirectory: installPath,
      ServerAddress: LCUser.serverUrl() ?? ''
    }
  }

  async install({
    path,
    platformToInstall
  }: InstallArgs): Promise<InstallResult> {
    const gameInfo = this.getGameInfo()
    if (!gameInfo.folder_name) {
      return { status: 'error', error: 'Game info not found' }
    }

    let installPath: string
    try {
      installPath = resolveInstallPath(path, gameInfo.folder_name)
    } catch (error) {
      return { status: 'error', error: String(error) }
    }
    sendGameStatusUpdate({
      appName: this.id,
      runner: 'lancommander',
      status: 'installing',
      folder: path
    })

    const abortId = this.id
    const controller = createAbortController(abortId)

    try {
      const lcGame = await this.fetchGame()
      const manager = libraryManagerMap['lancommander']
      const scripts = await manager.getScripts(this.id)
      const actions = await manager.getActions(this.id)
      await downloadAndExtract(
        this.id,
        installPath,
        (progress) => {
          if (progress.percent !== undefined) {
            this.onInstallOrUpdateOutput(
              'installing',
              `${progress.percent}`,
              progress.totalBytes ?? 0
            )
          }
        },
        controller.signal
      )

      const manifestPath = join(
        metadataDir(installPath, this.id),
        'Manifest.json'
      )
      await writeInstallMetadata(installPath, this.id, {
        Id: this.id,
        Title: gameInfo.title,
        Version: lcGame?.Archives?.at(-1)?.Version ?? '',
        SavePaths: lcGame?.SavePaths ?? []
      })

      let keyValue: string | undefined
      try {
        keyValue = await this.allocateKey()
      } catch (error) {
        logWarning(
          [`No key allocated for ${gameInfo.title}:`, String(error)],
          LogPrefix.LANCommander
        )
      }

      const installScript = pickHostScript(scripts, 'Install')
      const variables = this.scriptVariables(installPath, manifestPath)
      if (installScript) {
        const result = await runLCScript(installScript, variables, {
          workingDirectory: installPath,
          label: `install script for ${gameInfo.title}`
        })
        if (!result.ok) {
          notify({
            title: gameInfo.title,
            body: i18next.t(
              'notify.lancommander.install-script-warning',
              'The install script reported an error; the game was installed anyway.'
            )
          })
        }
      }

      const keyChange = pickHostScript(scripts, 'KeyChange')
      if (keyValue && keyChange) {
        await runLCScript(keyChange, {
          ...variables,
          NewKey: keyValue,
          Key: keyValue
        })
      }

      // Pick a launch action matching the install target platform
      const forWindows = platformToInstall.toLowerCase().includes('win')
      const action = pickAction(actions, forWindows)
      let executable = ''
      if (action?.Path) {
        const candidate = join(installPath, action.Path)
        if (existsSync(candidate)) {
          executable = candidate
        }
      }

      const platform: InstallPlatform =
        platformToInstall.toLowerCase() as InstallPlatform
      const installedEntry = {
        appName: this.id,
        install_path: installPath,
        executable,
        platform,
        version: lcGame?.Archives?.at(-1)?.Version ?? '',
        install_size: getFileSize(
          lcGame?.Archives?.at(-1)?.UncompressedSize ?? 0
        ),
        is_dlc: false
      }
      const installed = installedGamesStore.get('installed', [])
      const idx = installed.findIndex((i) => i.appName === this.id)
      if (idx >= 0) {
        installed[idx] = { ...installed[idx], ...installedEntry }
      } else {
        installed.push(installedEntry)
      }
      installedGamesStore.set('installed', installed)
      libraryManagerMap['lancommander'].refreshInstalled()
      libraryManagerMap['lancommander'].installState(this.id, true)

      metadataStore.set(this.id, {
        version: installedEntry.version,
        versionId: lcGame?.Archives?.at(-1)?.Id,
        key: keyValue,
        redistributables: (lcGame?.Redistributables ?? []).map((r) => r.Id)
      })

      await this.installRedistributables(
        installPath,
        lcGame?.Redistributables ?? []
      )

      if (!resolvePwsh() && scripts.length) {
        notify({
          title: gameInfo.title,
          body: i18next.t(
            'notify.lancommander.scripts-skipped',
            'PowerShell 7 (pwsh) was not found, so game scripts were skipped.'
          )
        })
      }

      try {
        await downloadLatestSave(
          {
            Id: this.id,
            Title: gameInfo.title,
            SavePaths: lcGame?.SavePaths ?? []
          },
          installPath
        )
      } catch (error) {
        logWarning(
          [`Save download failed for ${gameInfo.title}:`, String(error)],
          LogPrefix.LANCommander
        )
      }

      sendGameStatusUpdate({
        appName: this.id,
        runner: 'lancommander',
        status: 'done',
        folder: path
      })
      return { status: 'done' }
    } catch (error) {
      if (controller.signal.aborted) {
        sendGameStatusUpdate({
          appName: this.id,
          runner: 'lancommander',
          status: 'canceled',
          folder: path
        })
        return { status: 'abort' }
      }
      logError(
        [`LANCommander install failed for ${this.id}:`, String(error)],
        LogPrefix.LANCommander
      )
      sendGameStatusUpdate({
        appName: this.id,
        runner: 'lancommander',
        status: 'error',
        folder: path
      })
      return { status: 'error', error: String(error) }
    } finally {
      deleteAbortController(abortId)
    }
  }

  private async allocateKey(): Promise<string | undefined> {
    const metadata = metadataStore.get(this.id)
    if (metadata?.key) return metadata.key

    const nets = networkInterfaces()
    const mac =
      Object.values(nets)
        .flat()
        .find((n) => n && !n.internal && n.mac)?.mac ?? ''
    const ip =
      Object.values(nets)
        .flat()
        .find((n) => n && !n.internal && n.family === 'IPv4')?.address ?? ''

    try {
      const response = await LCUser.request<{ Value?: string }>(
        'post',
        `/api/Keys/Allocate/${this.id}`,
        {
          data: {
            GameId: this.id,
            MacAddress: mac,
            IpAddress: ip,
            ComputerName: hostname()
          }
        }
      )
      return response.data?.Value ?? undefined
    } catch {
      const response = await LCUser.request<{ Value?: string }>(
        'post',
        `/api/Keys/GetAllocated/${this.id}`,
        {
          data: {
            GameId: this.id,
            MacAddress: mac,
            IpAddress: ip,
            ComputerName: hostname()
          }
        }
      ).catch(() => undefined)
      return response?.data?.Value ?? undefined
    }
  }

  private async installRedistributables(
    installPath: string,
    redistributables: LCRedistributable[]
  ) {
    for (const redist of redistributables) {
      try {
        const target = join(metadataDir(installPath, redist.Id), 'files')
        const controller = createAbortController(`redist-${redist.Id}`)
        try {
          await downloadAndExtract(
            this.id,
            target,
            () => {},
            controller.signal,
            undefined,
            `/api/Redistributables/${redist.Id}/Download`
          )
        } finally {
          deleteAbortController(`redist-${redist.Id}`)
        }
        const redistScripts = (
          await LCUser.request<{ Scripts?: unknown }[] | unknown[]>(
            'get',
            `/api/Redistributables/${redist.Id}/Scripts`
          ).catch(() => undefined)
        )?.data
        const installScript = pickHostScript(
          (redistScripts ?? redist.Scripts ?? []) as typeof redist.Scripts,
          'Install'
        )
        if (installScript) {
          await runLCScript(installScript, {
            InstallDirectory: installPath,
            RedistributableManifest: join(
              metadataDir(installPath, redist.Id),
              'Manifest.json'
            )
          })
        }
      } catch (error) {
        logWarning(
          [`Skipping redistributable ${redist.Id}:`, String(error)],
          LogPrefix.LANCommander
        )
      }
    }
  }

  async update(): Promise<InstallResult> {
    const info = this.getGameInfo()
    const installPath = info.install?.install_path
    if (!installPath) {
      return { status: 'error', error: 'Game is not installed' }
    }

    const metadata = metadataStore.get(this.id)
    const controller = createAbortController(this.id)
    try {
      let archives: { Id: string; Version?: string }[] = []
      const response = await LCUser.request<{ Id: string; Version?: string }[]>(
        'get',
        `/api/Games/${this.id}/Updates?version=${encodeURIComponent(metadata?.version ?? info.install.version ?? '')}${metadata?.versionId ? `&versionId=${metadata.versionId}` : ''}`
      )
      archives = response.data ?? []

      if (!archives.length) {
        // Fall back to the latest full archive when no update chain exists
        const game = await this.fetchGame()
        const latest = game?.Archives?.at(-1)
        if (!latest) {
          return { status: 'error', error: 'No archive available' }
        }
        archives = [latest]
      }

      for (const archive of archives) {
        await downloadAndExtract(
          this.id,
          installPath,
          (progress) => {
            if (progress.percent !== undefined) {
              this.onInstallOrUpdateOutput(
                'updating',
                `${progress.percent}`,
                progress.totalBytes ?? 0
              )
            }
          },
          controller.signal,
          archive.Id
        )
      }

      const newVersion = archives.at(-1)?.Version ?? metadata?.version ?? ''
      const installed = installedGamesStore.get('installed', [])
      const entry = installed.find((i) => i.appName === this.id)
      if (entry) {
        entry.version = newVersion
        installedGamesStore.set('installed', installed)
      }
      metadataStore.set(this.id, { ...metadata, version: newVersion })

      sendGameStatusUpdate({
        appName: this.id,
        runner: 'lancommander',
        status: 'done'
      })
      return { status: 'done' }
    } catch (error) {
      if (controller.signal.aborted) {
        sendGameStatusUpdate({
          appName: this.id,
          runner: 'lancommander',
          status: 'canceled'
        })
        return { status: 'abort' }
      }
      sendGameStatusUpdate({
        appName: this.id,
        runner: 'lancommander',
        status: 'error'
      })
      return { status: 'error', error: String(error) }
    } finally {
      deleteAbortController(this.id)
    }
  }

  async uninstall({
    shouldRemovePrefix,
    deleteFiles = false
  }: RemoveArgs): Promise<ExecResult> {
    const gameInfo = this.getGameInfo()
    sendGameStatusUpdate({
      appName: this.id,
      runner: 'lancommander',
      status: 'uninstalling'
    })

    const scripts = (await this.fetchGame())?.Scripts ?? []
    const uninstallScript = pickHostScript(scripts, 'Uninstall')
    const installPath = gameInfo.install?.install_path
    if (uninstallScript && installPath) {
      await runLCScript(
        uninstallScript,
        this.scriptVariables(
          installPath,
          join(metadataDir(installPath, this.id), 'Manifest.json')
        ),
        { workingDirectory: installPath }
      )
    }

    if (shouldRemovePrefix) {
      removePrefix(this.id, 'lancommander')
    }

    const installed = installedGamesStore
      .get('installed', [])
      .filter((i) => i.appName !== this.id)
    installedGamesStore.set('installed', installed)
    metadataStore.set(this.id, {})
    syncStore.delete(this.id)

    if (deleteFiles && installPath && existsSync(installPath)) {
      const resolved = resolve(installPath)
      const marker = join(resolved, LC_METADATA_DIR, this.id)
      // only remove a directory that was created by our installer:
      // it must contain this game's metadata directory and must not be
      // a filesystem root or an empty base directory
      if (existsSync(marker) && resolved !== dirname(resolved)) {
        rmSync(resolved, { recursive: true, force: true })
      } else {
        logWarning(
          `Refusing to delete ${resolved}: no LANCommander metadata found`,
          LogPrefix.LANCommander
        )
      }
    }

    libraryManagerMap['lancommander'].refreshInstalled()
    libraryManagerMap['lancommander'].installState(this.id, false)

    notify({
      title: gameInfo.title,
      body: i18next.t('notify.uninstalled')
    })
    removeShortcutsUtil(this)
    removeRecentGame(this.id)
    removeNonSteamGame(this)

    sendGameStatusUpdate({
      appName: this.id,
      runner: 'lancommander',
      status: 'done'
    })
    return { stdout: '', stderr: '' }
  }

  isNative(): boolean {
    const { install } = this.getGameInfo()
    const platform = install?.platform?.toLowerCase()
    if (platform === 'windows') {
      return isWindows
    }
    return true
  }

  async addShortcuts(fromMenu?: boolean) {
    return addShortcutsUtil(this, fromMenu)
  }

  async removeShortcuts() {
    return removeShortcutsUtil(this)
  }

  async launch(
    logWriter: LogWriter,
    _launchArguments?: LaunchOption,
    args: string[] = []
  ): Promise<boolean> {
    const installPath = this.getGameInfo().install?.install_path

    // Signal play session start, run the game, then signal the stop
    try {
      await LCUser.request('get', `/api/Games/${this.id}/Started`)
    } catch (error) {
      logWarning(
        [`LANCommander Started call failed for ${this.id}:`, String(error)],
        LogPrefix.LANCommander
      )
    }

    if (installPath) {
      try {
        const scripts = await libraryManagerMap['lancommander'].getScripts(
          this.id
        )
        const beforeStart = pickHostScript(scripts, 'BeforeStart')
        if (beforeStart) {
          await runLCScript(beforeStart, {
            InstallDirectory: installPath,
            ServerAddress: LCUser.serverUrl() ?? ''
          })
        }
      } catch (error) {
        logWarning(
          [`BeforeStart script failed for ${this.id}:`, String(error)],
          LogPrefix.LANCommander
        )
      }
    }

    const result = await launchGame(this, logWriter, args)

    if (installPath) {
      try {
        const scripts = await libraryManagerMap['lancommander'].getScripts(
          this.id
        )
        const afterStop = pickHostScript(scripts, 'AfterStop')
        if (afterStop) {
          await runLCScript(afterStop, {
            InstallDirectory: installPath,
            ServerAddress: LCUser.serverUrl() ?? ''
          })
        }
      } catch (error) {
        logWarning(
          [`AfterStop script failed for ${this.id}:`, String(error)],
          LogPrefix.LANCommander
        )
      }
    }

    try {
      await LCUser.request('get', `/api/Games/${this.id}/Stopped`)
    } catch (error) {
      logWarning(
        [`LANCommander Stopped call failed for ${this.id}:`, String(error)],
        LogPrefix.LANCommander
      )
    }

    return result
  }

  async moveInstall(): Promise<InstallResult> {
    return { status: 'error', error: 'Not supported' }
  }

  async repair(): Promise<ExecResult> {
    return { stdout: '', stderr: '', error: 'Not supported' }
  }

  async syncSaves(arg: string): Promise<string> {
    const gameInfo = this.getGameInfo()
    const installPath = gameInfo.install?.install_path ?? ''
    try {
      const manifest = JSON.parse(
        await readFile(
          join(metadataDir(installPath, this.id), 'Manifest.json'),
          'utf-8'
        ).catch(() => '{}')
      )
      const saveManifest = {
        Id: this.id,
        SavePaths: manifest.SavePaths ?? []
      }
      // '--skip-upload' means download only, '--skip-download' means
      // upload only, '' means download then upload (launcher contract)
      if (arg !== '--skip-download') {
        await downloadLatestSave(saveManifest, installPath)
      }
      if (arg !== '--skip-upload') {
        await uploadSave(saveManifest, installPath)
      }
      return ''
    } catch (error) {
      logError(
        [`Save sync failed for ${this.id}:`, String(error)],
        LogPrefix.LANCommander
      )
      return String(error)
    }
  }

  async forceUninstall(): Promise<void> {
    const installed = installedGamesStore
      .get('installed', [])
      .filter((i) => i.appName !== this.id)
    installedGamesStore.set('installed', installed)
    libraryManagerMap['lancommander'].refreshInstalled()
  }

  async stop(): Promise<void> {
    const { install } = this.getGameInfo()
    const executable = install?.executable
    if (executable) {
      const { killPattern, shutdownWine } = await import('../../utils')
      const name = executable.split(/[\\/]/).pop()
      if (name) killPattern(name)
      if (!this.isNative()) {
        shutdownWine(await this.getSettings())
      }
    }
  }

  async isGameAvailable(): Promise<boolean> {
    const { install } = this.getGameInfo()
    if (!install?.executable) return false
    return existsSync(install.executable)
  }
}
