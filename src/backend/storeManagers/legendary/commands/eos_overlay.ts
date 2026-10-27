import type { Path } from 'backend/schemas'
import type { LegendaryAppName, NonEmptyString, ValidWinePrefix } from './base'

type EosOverlayAction =
  'install' | 'update' | 'remove' | 'enable' | 'disable' | 'info'

interface EosOverlayCommand {
  subcommand: 'eos-overlay'
  action: EosOverlayAction
  '--path'?: Path
  '--prefix'?: ValidWinePrefix
  '--app'?: LegendaryAppName
  '--bottle'?: NonEmptyString
}

export default EosOverlayCommand
