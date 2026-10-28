import { access, cp, readdir } from 'fs/promises'
import { basename, join } from 'path'
import { dialog } from 'electron'

import { isCLINoGui, isSteamDeckGameMode } from 'backend/constants/environment'
import { appFolder, heroicAppFolder, userHome } from 'backend/constants/paths'
import { logError, logInfo, LogPrefix } from 'backend/logger'

import type { PathLike } from 'fs'
import type { Migration } from '..'

const exists = async (path: PathLike) =>
  access(path).then(
    () => true,
    () => false
  )

// Files and folders Electron/Chromium creates inside an app's userData
// folder. They are caches or bound to the Heroic process that wrote them
// and are never carried over.
const userDataArtifacts = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'ShaderCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GraphiteDawnCache',
  'SharedImageCache',
  'Crashpad',
  'Crash Reports',
  'VideoDecodeStats',
  'WebrtcVideoStats',
  'WebStorage',
  'blob_storage',
  'DeferredBrowserMetrics',
  'Variations',
  'lockfile'
])
const userDataArtifactPrefixes = ['Singleton', '.org.chromium.', 'meo_devices']

function copyFilter(source: string): boolean {
  const name = basename(source)
  if (userDataArtifacts.has(name)) return false
  return !userDataArtifactPrefixes.some((prefix) => name.startsWith(prefix))
}

async function findHeroicDataFolders(): Promise<string[]> {
  const candidates = [
    heroicAppFolder,
    // Heroic's Flatpak stores its data here. Inside the Basalt Flatpak it
    // is visible through the matching filesystem permission.
    join(
      userHome,
      '.var',
      'app',
      'com.heroicgameslauncher.hgl',
      'config',
      'heroic'
    )
  ]

  const found: string[] = []
  for (const folder of candidates) {
    if (folder === appFolder) continue
    if (!(await exists(folder))) continue
    if (!(await readdir(folder)).length) continue
    found.push(folder)
  }
  return found
}

/**
 * Offers to import the data of an existing Heroic Games Launcher
 * installation (or a Basalt version from before the config folder rename)
 * into appFolder. The prompt is shown once; the choice is recorded in
 * appliedMigrations like any other migration.
 */
export class HeroicInstallMigration implements Migration {
  identifier = 'heroic-import-data'

  async run(): Promise<boolean> {
    const heroicDataFolders = await findHeroicDataFolders()
    if (!heroicDataFolders.length) return true

    // There is no GUI to ask on. Returning false retries the migration on
    // the next regular start so the offer is not lost.
    if (isCLINoGui || isSteamDeckGameMode) {
      logInfo(
        'Heroic data folder detected, not asking to import without a desktop session',
        LogPrefix.Backend
      )
      return false
    }

    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: 'Import Heroic data',
      message: 'Heroic Games Launcher data found',
      detail:
        'An existing Heroic Games Launcher installation was found at:\n' +
        heroicDataFolders.join('\n') +
        '\n\nImport its settings, game data and login information into ' +
        'Basalt? The Heroic data is copied over and not modified.',
      buttons: ['Import', 'Skip'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })

    if (response !== 0) {
      logInfo('User skipped importing Heroic data', LogPrefix.Backend)
      return true
    }

    try {
      for (const folder of heroicDataFolders) {
        await cp(folder, appFolder, {
          recursive: true,
          filter: copyFilter
        })
        logInfo(`Imported Heroic data from ${folder}`, LogPrefix.Backend)
      }
    } catch (error) {
      logError(['Failed to import Heroic data:', error], LogPrefix.Backend)
    }

    return true
  }
}
