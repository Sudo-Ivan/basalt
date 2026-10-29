import { TypeCheckedStoreBackend } from '../../electron_store'
import CacheStore from '../../cache'
import { GameInfo } from 'common/types'
import { LCInstallMetadata } from 'common/types/lancommander'

const configStore = new TypeCheckedStoreBackend('lancommanderConfigStore', {
  cwd: 'lancommander_store'
})

const installedGamesStore = new TypeCheckedStoreBackend(
  'lancommanderInstalledGamesStore',
  {
    cwd: 'lancommander_store',
    name: 'installed'
  }
)

const libraryStore = new CacheStore<GameInfo[], 'games'>(
  'lancommander_library',
  null
)

const metadataStore = new CacheStore<LCInstallMetadata>(
  'lancommander_install_metadata',
  null
)

const syncStore = new TypeCheckedStoreBackend('lancommanderSyncStore', {
  cwd: 'lancommander_store',
  name: 'saveTimestamps'
})

export {
  configStore,
  installedGamesStore,
  libraryStore,
  metadataStore,
  syncStore
}
