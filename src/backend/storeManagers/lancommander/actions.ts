import { LCAction } from 'common/types/lancommander'
import { isLinux, isMac, isWindows } from 'backend/constants/environment'

function hostFlag(forWindows: boolean): number {
  if (forWindows) return 1
  if (isMac) return 4
  if (isLinux) return 2
  if (isWindows) return 1
  return 2
}

/**
 * Chooses the launch action for a game: prefers the primary action among
 * those matching the target platform, then the first match, then any
 * action at all.
 */
export function pickAction(
  actions: LCAction[] | undefined,
  forWindows: boolean
): LCAction | undefined {
  const list = actions ?? []
  if (!list.length) return undefined
  const flag = hostFlag(forWindows)
  const matching = list.filter(
    (action) => !action.Platforms || (action.Platforms & flag) !== 0
  )
  return matching.find((a) => a.IsPrimaryAction) ?? matching[0] ?? list[0]
}
