import { mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'graceful-fs'
import JSZip from 'jszip'

jest.mock('electron')
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { LANCommander: 'LANCommander' }
}))
jest.mock('backend/online_monitor', () => ({ isOnline: () => true }))
jest.mock('backend/utils', () => ({
  clearCache: jest.fn(),
  getFileSize: jest.fn(() => '1 MB'),
  sendGameStatusUpdate: jest.fn(),
  sendProgressUpdate: jest.fn()
}))
jest.mock('backend/constants/paths', () => {
  const { tmpdir } = jest.requireActual<typeof import('os')>('os')
  const { join } = jest.requireActual<typeof import('path')>('path')
  return {
    ...jest.requireActual('backend/constants/paths'),
    userDataPath: join(tmpdir(), 'basalt-test-userdata')
  }
})

const sharedStore = new Map<string, Map<string, unknown>>()
jest.mock('electron-store', () => {
  return class MockStore {
    private data: Map<string, unknown>
    constructor(public options?: { name?: string }) {
      const name = options?.name ?? 'default'
      if (!sharedStore.has(name)) sharedStore.set(name, new Map())
      this.data = sharedStore.get(name)!
    }
    get(key: string, def?: unknown) {
      return this.data.has(key) ? this.data.get(key) : def
    }
    set(key: string, value: unknown) {
      this.data.set(key, value)
    }
    has(key: string) {
      return this.data.has(key)
    }
    delete(key: string) {
      this.data.delete(key)
    }
    clear() {
      this.data.clear()
    }
  }
})

import { normalizeServerUrl } from '../url'
import {
  lcGameToGameInfo,
  resolveInstallPath,
  sanitizeFolderName
} from '../mapping'
import { normalizeKeys } from '../normalize'
import { scriptTypeName, mediaTypeName, savePathTypeName } from '../enums'
import { LCUser } from '../user'
import { configStore } from '../electronStores'
import { startFakeServer } from './fakeServer'
import {
  buildScriptPreamble,
  currentRuntimeFlag,
  isValidVariableName,
  privateScriptsDir,
  resolvePwsh,
  scriptMatchesHost,
  shimModulePathForRuntime
} from '../scripts'
import { packSaves, unpackSaves } from '../saves'

describe('normalizeKeys', () => {
  it('capitalizes nested keys and skips free-form dictionaries', () => {
    const wire = {
      id: 'g1',
      title: 'Game',
      media: [{ id: 'm1', type: 1, fileId: 'f1', sortOrder: 0 }],
      actions: [
        {
          id: 'a1',
          path: 'run.sh',
          variables: { install_dir: 'x', Foo: 'keep-case' }
        }
      ]
    }
    const out = normalizeKeys(wire) as Record<string, unknown>
    expect(out.Id).toBe('g1')
    expect(out.Title).toBe('Game')
    const media = out.Media as Record<string, unknown>[]
    expect(media[0].Type).toBe(1)
    expect(media[0].FileId).toBe('f1')
    const actions = out.Actions as Record<string, unknown>[]
    expect(actions[0].Path).toBe('run.sh')
    const vars = actions[0].Variables as Record<string, unknown>
    expect(vars['install_dir']).toBe('x')
    expect(vars.Foo).toBe('keep-case')
  })
})

describe('enum helpers', () => {
  it('resolves numeric and string values', () => {
    expect(scriptTypeName(0)).toBe('Install')
    expect(scriptTypeName(15)).toBe('RunWrapper')
    expect(scriptTypeName('Install')).toBe('Install')
    expect(mediaTypeName(1)).toBe('Cover')
    expect(mediaTypeName('Grid')).toBe('Grid')
    expect(savePathTypeName(0)).toBe('File')
    expect(savePathTypeName(1)).toBe('Registry')
  })
})

describe('normalizeServerUrl', () => {
  it('accepts http and https and strips trailing slashes', () => {
    expect(normalizeServerUrl('http://lan.local:1337/')).toBe(
      'http://lan.local:1337'
    )
    expect(normalizeServerUrl('https://lan.local/')).toBe('https://lan.local')
  })
  it('adds https when scheme missing', () => {
    expect(normalizeServerUrl('lan.local:1337')).toBe('https://lan.local:1337')
  })
  it('rejects empty, garbage and non-http schemes', () => {
    expect(() => normalizeServerUrl('')).toThrow()
    expect(() => normalizeServerUrl('ftp://x')).toThrow()
  })
})

describe('lcGameToGameInfo', () => {
  const server = 'http://lc.local'
  it('maps cover/icon/background media to art fields with fileId', () => {
    const info = lcGameToGameInfo(
      {
        Id: 'abc',
        Title: 'Test Game',
        Media: [
          { Id: 'm1', FileId: 'fcover', Type: 1 },
          { Id: 'm2', FileId: 'ficon', Type: 0 },
          { Id: 'm3', Type: 2 }
        ]
      },
      server
    )
    expect(info.app_name).toBe('abc')
    expect(info.runner).toBe('lancommander')
    expect(info.art_cover).toBe(`${server}/api/Media/m1/Download?fileId=fcover`)
    expect(info.art_square).toBe(`${server}/api/Media/m2/Download?fileId=ficon`)
    expect(info.art_background).toBe(`${server}/api/Media/m3/Download`)
  })
  it('handles missing media and fields', () => {
    const info = lcGameToGameInfo({ Id: 'x', Title: 'T' }, server)
    expect(info.art_cover).toBe('')
    expect(info.folder_name).toBe('T')
    expect(info.cloud_save_enabled).toBeUndefined()
  })
  it('enables cloud saves when a file save path exists', () => {
    const info = lcGameToGameInfo(
      {
        Id: 'x',
        Title: 'T',
        SavePaths: [{ Id: 's1', Type: 0, Path: 'save', Platforms: 0 }]
      },
      server
    )
    expect(info.cloud_save_enabled).toBe(true)
  })
})

describe('sanitizeFolderName / resolveInstallPath', () => {
  it('rejects traversal names', () => {
    expect(sanitizeFolderName('../x')).toBe('.._x'.replace(/^\.+/, '') + '')
    expect(sanitizeFolderName('..')).toBe('game')
    expect(sanitizeFolderName('.')).toBe('game')
    expect(sanitizeFolderName('/etc')).toBe('_etc')
    expect(sanitizeFolderName('a/../../b')).toBe('a_.._.._b')
  })
  it('resolves inside the base path only', () => {
    const base = mkdtempSync(join(tmpdir(), 'lc-base-'))
    expect(resolveInstallPath(base, 'game')).toBe(join(base, 'game'))
    expect(resolveInstallPath(base, '../evil')).toBe(join(base, '_evil'))
    rmSync(base, { recursive: true, force: true })
  })
})

describe('LCUser auth', () => {
  it('logs in with camelCase tokens, never stores the password and refreshes on 401', async () => {
    const server = await startFakeServer()
    try {
      const result = await LCUser.login(server.url, 'user', 'pass', false)
      expect(result.status).toBe('done')
      expect(configStore.get('accessToken', '')).toBe('access-token')
      expect(configStore.get_nodefault('password')).toBeUndefined()

      server.force401.add('/api/Auth/Validate')
      const ok = await LCUser.isLoggedIn()
      expect(ok).toBe(true)
      expect(configStore.get('accessToken', '')).toBe('access-token-2')
    } finally {
      await server.close()
    }
  })

  it('rejects bad credentials', async () => {
    const server = await startFakeServer()
    try {
      const result = await LCUser.login(server.url, 'user', 'wrong', false)
      expect(result.status).toBe('error')
    } finally {
      await server.close()
    }
  })

  it('marks logged out when refresh fails', async () => {
    const server = await startFakeServer()
    try {
      await LCUser.login(server.url, 'user', 'pass', false)
      configStore.set('refreshToken', 'bad-token')
      const refreshed = await LCUser.refreshToken()
      expect(refreshed).toBe(false)
    } finally {
      await server.close()
    }
  })

  it('keeps the bearer token when custom headers are passed', async () => {
    const server = await startFakeServer()
    try {
      await LCUser.login(server.url, 'user', 'pass', false)
      const boundary = '----basalttest'
      const body = Buffer.from(
        `--${boundary}\r\n` +
          'Content-Disposition: form-data; name="file"; filename="x"\r\n' +
          'Content-Type: application/zip\r\n\r\nabc\r\n' +
          `--${boundary}--\r\n`
      )
      await LCUser.request('post', '/api/Saves/Game/game-1/Upload', {
        data: body,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        }
      })
      const upload = server.requests.find((r) => r.url.includes('/Upload'))
      expect(upload).toBeTruthy()
      expect(server.unauthenticatedUploads).toHaveLength(0)
    } finally {
      await server.close()
    }
  })
})

describe('scripts', () => {
  it('resolves pwsh from PATH entries', () => {
    const fake = join(tmpdir(), 'pwshdir')
    const pwshPath = join(fake, 'pwsh')
    expect(resolvePwsh(fake, (p) => p === pwshPath)).toBe(pwshPath)
    expect(resolvePwsh(fake, () => false)).toBeUndefined()
  })
  it('preamble escapes quotes, skips invalid names and imports the shim', () => {
    const preamble = buildScriptPreamble(
      {
        InstallDirectory: "C:\\Games\\O'Brien",
        PlayerAlias: 'uśer',
        'bad name!': 'skip me'
      },
      '/scripts/LANCommander.SDK.Shim-x.psm1'
    )
    expect(preamble).toContain("O''Brien")
    expect(preamble).toContain('$InstallDirectory =')
    expect(preamble).toContain('$PlayerAlias =')
    expect(preamble).not.toContain('bad name')
    expect(preamble).toContain('LANCommander.SDK.Shim-x.psm1')
  })
  it('validates variable names', () => {
    expect(isValidVariableName('InstallDirectory')).toBe(true)
    expect(isValidVariableName('_ok2')).toBe(true)
    expect(isValidVariableName('2bad')).toBe(false)
    expect(isValidVariableName('a b')).toBe(false)
  })
  it('matches scripts by host platform flags', () => {
    const flag = currentRuntimeFlag()
    expect(scriptMatchesHost(0)).toBe(true)
    expect(scriptMatchesHost(flag)).toBe(true)
    expect(scriptMatchesHost(flag === 1 ? 2 : 1)).toBe(false)
  })
  it('uses a private scripts dir with a hashed shim name', () => {
    const base = join(tmpdir(), `lc-priv-${Date.now()}`)
    const dir = privateScriptsDir(join(base, 'lancommander-scripts'))
    const shim = shimModulePathForRuntime(dir)
    expect(dir).toContain('lancommander-scripts')
    expect(shim).toContain('LANCommander.SDK.Shim-')
    expect(shim.startsWith(dir)).toBe(true)
  })
})

describe('saves pack/unpack', () => {
  it('roundtrips save files through the Files/{id}/ layout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lc-saves-'))
    const installDir = join(dir, 'install')
    const saveDir = join(dir, 'saves', 'profile')
    mkdirSync(saveDir, { recursive: true })
    writeFileSync(join(saveDir, 'save.dat'), 'savedata')
    mkdirSync(installDir, { recursive: true })

    const manifest = {
      Id: 'game-1',
      SavePaths: [
        {
          Id: 'sp1',
          Type: 0,
          Path: saveDir,
          WorkingDirectory: saveDir,
          Platforms: currentRuntimeFlag()
        }
      ]
    }

    const { data: buffer, fileCount } = await packSaves(manifest, installDir)
    expect(fileCount).toBe(1)
    const zip = await JSZip.loadAsync(buffer)
    expect(Object.keys(zip.files).some((n) => n.startsWith('Files/sp1/'))).toBe(
      true
    )
    expect(zip.files['Manifest.json']).toBeTruthy()

    const zipPath = join(dir, 'save.zip')
    writeFileSync(zipPath, buffer)
    rmSync(saveDir, { recursive: true })

    await unpackSaves(zipPath, manifest, installDir)
    expect(readFileSync(join(saveDir, 'save.dat'), 'utf-8')).toBe('savedata')
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports zero files when no save path matches', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lc-saves-empty-'))
    const manifest = {
      Id: 'game-1',
      SavePaths: [
        { Id: 'sp1', Type: 0, Path: join(dir, 'nothing'), Platforms: 0 }
      ]
    }
    const { fileCount } = await packSaves(manifest, dir)
    expect(fileCount).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('downloadAndExtract', () => {
  jest.setTimeout(30000)
  it('extracts entries, reports progress and cleans up on truncation', async () => {
    const { downloadAndExtract } = await import('../download')
    const server = await startFakeServer({
      zipEntries: { 'sub/file.txt': 'content' }
    })
    const base = mkdtempSync(join(tmpdir(), 'lc-dl-'))
    const dest = join(base, 'game')
    try {
      await LCUser.login(server.url, 'user', 'pass', false)

      const progress: number[] = []
      const controller = new AbortController()
      await downloadAndExtract(
        'game-1',
        dest,
        (p) => {
          if (p.percent !== undefined) progress.push(p.percent)
        },
        controller.signal
      )
      expect(readFileSync(join(dest, 'sub', 'file.txt'), 'utf-8')).toBe(
        'content'
      )
      expect(progress.at(-1)).toBe(100)
      // temp zip written next to the destination and removed afterwards
      const leftovers = readdirSync(base)
      expect(leftovers.some((f: string) => f.endsWith('.zip'))).toBe(false)

      const dest2 = join(base, 'second')
      server.truncateDownloads = true
      await expect(
        downloadAndExtract('game-1', dest2, () => {}, controller.signal)
      ).rejects.toThrow()
      expect(existsSync(dest2)).toBe(false)
    } finally {
      await server.close()
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('rejects zip-slip entries', async () => {
    const { downloadAndExtract } = await import('../download')
    const server = await startFakeServer({
      zipEntries: { '../evil.txt': 'x' }
    })
    const dest = mkdtempSync(join(tmpdir(), 'lc-slip-'))
    try {
      await LCUser.login(server.url, 'user', 'pass', false)
      await expect(
        downloadAndExtract(
          'game-1',
          dest,
          () => {},
          new AbortController().signal
        )
      ).rejects.toThrow()
      expect(existsSync(join(dest, '..', 'evil.txt'))).toBe(false)
    } finally {
      await server.close()
      rmSync(dest, { recursive: true, force: true })
    }
  })
})

describe('pickAction', () => {
  it('selects a platform-matching primary action', async () => {
    const { pickAction } = await import('../actions')
    const actions = [
      {
        Id: 'a1',
        GameId: 'g',
        Name: 'win',
        Path: 'win.exe',
        IsPrimaryAction: false,
        Platforms: 1
      },
      {
        Id: 'a2',
        GameId: 'g',
        Name: 'nix',
        Path: 'run.sh',
        IsPrimaryAction: true,
        Platforms: 2
      },
      {
        Id: 'a3',
        GameId: 'g',
        Name: 'any',
        Path: 'run',
        IsPrimaryAction: false,
        Platforms: 0
      }
    ]
    const picked = pickAction(actions, false)
    expect(picked).toBeTruthy()
    if (currentRuntimeFlag() === 2) {
      expect(picked!.Path).toBe('run.sh')
    }
    expect(pickAction([], false)).toBeUndefined()
  })
})
