/**
 * Normalizes a user supplied LANCommander server address.
 * Accepts http/https only, adds https:// when no scheme is given,
 * lowercases the origin and strips trailing slashes.
 * Throws on invalid input.
 */
export function normalizeServerUrl(input: string): string {
  let value = (input ?? '').trim()
  if (!value) {
    throw new Error('Server URL is empty')
  }
  if (value.includes('://') && !/^https?:\/\//i.test(value)) {
    throw new Error(`Invalid server URL: ${input}`)
  }
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid server URL: ${input}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Invalid server URL protocol: ${url.protocol}`)
  }
  const normalized = url.toString().replace(/\/+$/, '')
  return normalized
}
