import { Runner } from './types'

export const storeMap = {
  legendary: 'epic',
  gog: 'gog',
  nile: 'amazon',
  sideload: undefined,
  zoom: 'zoom',
  lancommander: 'lancommander'
} as const satisfies Record<Runner, string | undefined>
