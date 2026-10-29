// Wire types for the LANCommander server API (LANCommander.SDK models)

export type LCAuthToken = {
  AccessToken: string
  RefreshToken: string
  Expiration: string
}

export type LCLoginResult = {
  status: 'done' | 'error' | 'needs-login'
  data?: { username: string }
  error?: string
}

export type LCMedia = {
  Id: string
  FileId?: string
  Name?: string
  Type: string | number
  SourceUrl?: string
  MimeType?: string
  SortOrder?: number
}

export type LCAction = {
  Id: string
  GameId: string
  Name: string
  Arguments?: string
  Path: string
  WorkingDirectory?: string
  IsPrimaryAction: boolean
  SortOrder?: number
  Platforms: number
  Variables?: Record<string, string>
}

export type LCScript = {
  Id: string
  Type: string | number
  Name?: string
  Description?: string
  RequiresAdmin?: boolean
  Platforms: number
  Contents: string
}

export type LCArchive = {
  Id: string
  Version?: string
  Changelog?: string
  CompressedSize?: number
  UncompressedSize?: number
}

export type LCSavePath = {
  Id: string
  Type: string | number
  Path: string
  WorkingDirectory?: string
  IsRegex?: boolean
  Platforms: number
}

export type LCGame = {
  Id: string
  Title: string
  SortTitle?: string
  DirectoryName?: string
  Description?: string
  Notes?: string
  ReleasedOn?: string
  Type?: number | string
  BaseGameId?: string
  InLibrary?: boolean
  Developers?: { Name?: string; Value?: string }[]
  Publishers?: { Name?: string; Value?: string }[]
  Genres?: { Name?: string; Value?: string }[]
  Tags?: { Name?: string; Value?: string }[]
  Platforms?: { Name?: string; Value?: string }[]
  Media?: LCMedia[]
  Actions?: LCAction[]
  Archives?: LCArchive[]
  Scripts?: LCScript[]
  SavePaths?: LCSavePath[]
  Redistributables?: LCRedistributable[]
}

export type LCRedistributable = {
  Id: string
  Name?: string
  Description?: string
  Scripts?: LCScript[]
}

export type LCKey = {
  Id?: string
  Value: string
}

export type LCGameSave = {
  Id: string
  GameId: string
  Size?: number
  CreatedOn?: string
  Path?: string
}

export type LCInstallMetadata = {
  version?: string
  versionId?: string
  archiveId?: string
  key?: string
  redistributables?: string[]
  playerAlias?: string
}
