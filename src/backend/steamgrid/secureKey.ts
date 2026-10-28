import { safeStorage } from 'electron'
import { logWarning, LogPrefix } from 'backend/logger'

const CIPHERTEXT_PREFIX = 'sgdb:v1:'

async function encryptionAvailable(): Promise<boolean> {
  try {
    return await safeStorage.isAsyncEncryptionAvailable()
  } catch {
    return false
  }
}

export function isEncryptedValue(stored: string): boolean {
  return stored.startsWith(CIPHERTEXT_PREFIX)
}

export async function encryptApiKey(plain: string): Promise<string> {
  if (!plain) return ''
  if (!(await encryptionAvailable())) {
    logWarning(
      'safeStorage unavailable, storing SteamGridDB API key in plaintext',
      LogPrefix.Backend
    )
    return plain
  }
  const ciphertext = (await safeStorage.encryptStringAsync(plain)).toString(
    'base64'
  )
  return `${CIPHERTEXT_PREFIX}${ciphertext}`
}

export async function decryptApiKey(stored: string): Promise<string> {
  if (!stored) return ''
  if (!isEncryptedValue(stored)) {
    // Legacy plaintext from before encryption was introduced.
    return stored
  }
  if (!(await encryptionAvailable())) return ''
  try {
    const buf = Buffer.from(stored.slice(CIPHERTEXT_PREFIX.length), 'base64')
    const { result } = await safeStorage.decryptStringAsync(buf)
    return result
  } catch (error) {
    logWarning(
      ['Failed to decrypt SteamGridDB API key:', error],
      LogPrefix.Backend
    )
    return ''
  }
}
