import { GlobalConfig } from 'backend/config'
import { addHandler } from 'backend/ipc'
import { logError, LogPrefix } from 'backend/logger'
import * as SteamGridDB from './utils'
import { encryptApiKey, decryptApiKey, isEncryptedValue } from './secureKey'

function readStoredApiKey(): string {
  const stored: string = GlobalConfig.get().getSettings().steamGridDbApiKey
  return stored ?? ''
}

async function getDecryptedApiKey(): Promise<string> {
  const stored = readStoredApiKey()
  if (!stored) return ''

  // Migrate legacy plaintext values on first read.
  if (!isEncryptedValue(stored)) {
    const reEncrypted = await encryptApiKey(stored)
    if (isEncryptedValue(reEncrypted)) {
      GlobalConfig.get().setSetting('steamGridDbApiKey', reEncrypted)
    }
    return stored
  }

  return decryptApiKey(stored)
}

addHandler('steamgriddb.hasApiKey', () => !!readStoredApiKey())

addHandler('steamgriddb.setApiKey', async (event, key) => {
  const trimmed = key.trim()
  const stored = trimmed ? await encryptApiKey(trimmed) : ''
  GlobalConfig.get().setSetting('steamGridDbApiKey', stored)
})

addHandler('steamgriddb.searchGame', async (event, query) => {
  const apiKey = await getDecryptedApiKey()
  if (!apiKey) {
    return []
  }

  try {
    const results = await SteamGridDB.searchGame(apiKey, query)
    return results.map((game) => ({
      id: game.id,
      name: game.name
    }))
  } catch (error) {
    logError(['SteamGridDB search failed:', error], LogPrefix.Backend)
    throw error
  }
})

addHandler('steamgriddb.getGrids', async (event, args) => {
  const apiKey = await getDecryptedApiKey()
  if (!apiKey) {
    return []
  }

  try {
    const results = await SteamGridDB.getGrids(apiKey, {
      gameId: args.gameId,
      dimensions: args.dimensions,
      styles: args.styles
    })
    return results.map((grid) => ({
      id: grid.id,
      url: grid.url,
      thumb: grid.thumb
    }))
  } catch (error) {
    logError([`SteamGridDB getGrids failed:`, error], LogPrefix.Backend)
    throw error
  }
})

addHandler('steamgriddb.getHeroes', async (event, args) => {
  const apiKey = await getDecryptedApiKey()
  if (!apiKey) {
    return []
  }

  try {
    const results = await SteamGridDB.getHeroes(apiKey, {
      gameId: args.gameId,
      dimensions: args.dimensions,
      styles: args.styles
    })
    return results.map((grid) => ({
      id: grid.id,
      url: grid.url,
      thumb: grid.thumb
    }))
  } catch (error) {
    logError([`SteamGridDB getHeroes failed:`, error], LogPrefix.Backend)
    throw error
  }
})
