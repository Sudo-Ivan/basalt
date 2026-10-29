// Enum value names in the SDK's declaration order. The server serializes
// enums numerically, but these helpers also accept the string names so
// both shapes work.

const SCRIPT_TYPES = [
  'Install',
  'Uninstall',
  'NameChange',
  'KeyChange',
  'SaveUpload',
  'SaveDownload',
  'DetectInstall',
  'BeforeStart',
  'AfterStop',
  'GameStarted',
  'GameStopped',
  'UserRegistration',
  'UserLogin',
  'ApplicationStart',
  'Package',
  'RunWrapper'
] as const

const MEDIA_TYPES = [
  'Icon',
  'Cover',
  'Background',
  'Avatar',
  'Logo',
  'Manual',
  'Thumbnail',
  'PageImage',
  'Grid',
  'Screenshot',
  'Video'
] as const

const SAVE_PATH_TYPES = ['File', 'Registry'] as const

function enumName(
  value: string | number | undefined,
  names: readonly string[]
): string {
  if (typeof value === 'number') {
    return names[value] ?? String(value)
  }
  return value ?? ''
}

export function scriptTypeName(value: string | number | undefined): string {
  return enumName(value, SCRIPT_TYPES)
}

export function mediaTypeName(value: string | number | undefined): string {
  return enumName(value, MEDIA_TYPES)
}

export function savePathTypeName(value: string | number | undefined): string {
  return enumName(value, SAVE_PATH_TYPES)
}
