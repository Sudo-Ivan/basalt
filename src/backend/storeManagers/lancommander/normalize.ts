/**
 * The LANCommander server serializes JSON with camelCase keys while the
 * SDK models are PascalCase. This normalizer recursively capitalizes the
 * first character of every object key so the rest of the code can work
 * against the SDK model names.
 *
 * Keys under these properties are user data in free-form dictionaries and
 * are left untouched (the dictionary itself is skipped, not re-keyed):
 * Variables (Action), Options (manifest Game), RedistributableOptions,
 * Parameters (SDK helper payloads).
 */
const FREE_FORM_DICT_KEYS = new Set([
  'variables',
  'options',
  'redistributableoptions',
  'parameters'
])

export function normalizeKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeKeys(item)) as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    )) {
      const normalizedKey = key.charAt(0).toUpperCase() + key.slice(1)
      if (FREE_FORM_DICT_KEYS.has(key.toLowerCase())) {
        out[normalizedKey] = item
      } else {
        out[normalizedKey] = normalizeKeys(item)
      }
    }
    return out as T
  }
  return value
}
