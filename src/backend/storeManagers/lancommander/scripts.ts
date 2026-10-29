import { existsSync, statSync } from 'graceful-fs'
import { delimiter, join } from 'node:path'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { isLinux, isMac, isWindows } from 'backend/constants/environment'
import { userDataPath } from 'backend/constants/paths'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { LCScript } from 'common/types/lancommander'
import { SHIM_MODULE_CONTENTS } from './shimModule'
import { scriptTypeName } from './enums'

// RuntimePlatform flags: Windows = 1, Linux = 2, macOS = 4
export function currentRuntimeFlag(): number {
  if (isWindows) return 1
  if (isMac) return 4
  if (isLinux) return 2
  return 0
}

export function scriptMatchesHost(platforms: number | undefined): boolean {
  // 0 / undefined means the script applies to every platform
  if (!platforms) return true
  return (platforms & currentRuntimeFlag()) !== 0
}

const PWSH_CANDIDATES = [
  '/usr/bin/pwsh',
  '/usr/local/bin/pwsh',
  '/opt/microsoft/powershell/7/pwsh',
  'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe'
]

/**
 * Resolves a PowerShell 7 executable. pathEnv and exists are
 * injectable so the logic can be unit tested.
 */
export function resolvePwsh(
  pathEnv: string = process.env.PATH ?? '',
  exists: (candidate: string) => boolean = existsSync
): string | undefined {
  const seen = new Set<string>()
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue
    for (const name of ['pwsh', 'pwsh.exe']) {
      const candidate = join(dir, name)
      if (seen.has(candidate)) continue
      seen.add(candidate)
      if (exists(candidate)) {
        return candidate
      }
    }
  }
  for (const candidate of PWSH_CANDIDATES) {
    if (exists(candidate)) {
      return candidate
    }
  }
  return undefined
}

export type ScriptVariables = Record<string, string>

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function isValidVariableName(name: string): boolean {
  return VARIABLE_NAME.test(name)
}

const escapePsString = (value: string): string =>
  `'${value.replace(/'/g, "''")}'`

const SCRIPT_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Per-user private directory for materialized scripts. Falls back to a
 * private subdirectory of the system temp dir when the app data path is
 * unavailable, and refuses to reuse anything not owned by this user.
 */
export function privateScriptsDir(baseDir?: string): string {
  const candidate =
    baseDir ?? join(userDataPath ?? tmpdir(), 'lancommander-scripts')
  try {
    const stats = statSync(candidate)
    if (
      typeof process.getuid === 'function' &&
      stats.uid !== process.getuid()
    ) {
      return ''
    }
    if ((stats.mode & 0o077) !== 0) {
      return ''
    }
  } catch {
    // does not exist yet
  }
  return candidate
}

const shimHash = createHash('sha256')
  .update(SHIM_MODULE_CONTENTS)
  .digest('hex')
  .slice(0, 16)

export function shimModuleName(): string {
  return `LANCommander.SDK.Shim-${shimHash}.psm1`
}

/**
 * Path the generated preamble imports. Deterministic so it can be
 * computed before the file is materialized by ensurePrivateDir.
 */
export function shimModulePathForRuntime(baseDir?: string): string {
  const dir = privateScriptsDir(baseDir)
  if (!dir) return join(tmpdir(), `basalt-lc-noscript-${shimHash}.psm1`)
  return join(dir, shimModuleName())
}

async function ensurePrivateDir(baseDir?: string): Promise<string> {
  let dir = privateScriptsDir(baseDir)
  if (!dir) {
    dir = await mkdtemp(join(tmpdir(), 'basalt-lc-scripts-'))
  }
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const shimPath = join(dir, shimModuleName())
  await writeFile(shimPath, SHIM_MODULE_CONTENTS, {
    encoding: 'utf-8',
    mode: 0o600
  })
  return dir
}

/**
 * Builds the preamble prepended to every LANCommander script. It defines
 * the documented variables and imports the shim module implementing the
 * SDK cmdlets. Variable names that are not valid PowerShell identifiers
 * are skipped with a warning. Pure function for testability.
 */
export function buildScriptPreamble(
  variables: ScriptVariables,
  shimPath?: string
): string {
  const lines = ['# Basalt LANCommander shim preamble']
  lines.push(
    `Import-Module ${escapePsString(shimPath ?? shimModulePathForRuntime())} -Force`
  )
  for (const [key, value] of Object.entries(variables)) {
    if (!isValidVariableName(key)) {
      logWarning(
        `Skipping invalid script variable name '${key}'`,
        LogPrefix.LANCommander
      )
      continue
    }
    lines.push(`$${key} = ${escapePsString(value)}`)
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * Runs a LANCommander PowerShell script through pwsh when the script
 * targets the host platform. Returns whether the script ran and whether
 * it exited cleanly.
 */
export async function runLCScript(
  script: LCScript,
  variables: ScriptVariables,
  options: { workingDirectory?: string; label?: string } = {}
): Promise<{ ran: boolean; ok: boolean }> {
  const label = options.label ?? `script ${script.Name ?? script.Id ?? ''}`

  if (!scriptMatchesHost(script.Platforms)) {
    logInfo(
      `Skipping ${label}: does not target this platform`,
      LogPrefix.LANCommander
    )
    return { ran: false, ok: true }
  }

  const pwsh = resolvePwsh()
  if (!pwsh) {
    logWarning(
      `Skipping ${label}: PowerShell 7 (pwsh) not found`,
      LogPrefix.LANCommander
    )
    return { ran: false, ok: true }
  }

  const dir = await ensurePrivateDir()
  const contents =
    buildScriptPreamble(variables, join(dir, shimModuleName())) +
    '\n' +
    script.Contents
  const scriptPath = join(dir, `script-${randomUUID()}.ps1`)
  await writeFile(scriptPath, contents, { encoding: 'utf-8', mode: 0o600 })

  try {
    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn(
        pwsh,
        ['-NoProfile', '-NonInteractive', '-File', scriptPath],
        {
          cwd: options.workingDirectory,
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
      const timeout = setTimeout(() => {
        logError(
          `${label} timed out after ${SCRIPT_TIMEOUT_MS / 60000} minutes`,
          LogPrefix.LANCommander
        )
        child.kill('SIGKILL')
      }, SCRIPT_TIMEOUT_MS)
      timeout.unref?.()
      child.stdout.on('data', (data: Buffer) => {
        logInfo(`[pwsh] ${String(data).trim()}`, LogPrefix.LANCommander)
      })
      child.stderr.on('data', (data: Buffer) => {
        logWarning(`[pwsh] ${String(data).trim()}`, LogPrefix.LANCommander)
      })
      child.on('error', () => {
        clearTimeout(timeout)
        resolve(-1)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        resolve(code ?? -1)
      })
    })

    if (exitCode !== 0) {
      logError(`${label} exited with code ${exitCode}`, LogPrefix.LANCommander)
      return { ran: true, ok: false }
    }
    return { ran: true, ok: true }
  } finally {
    const { rm } = await import('node:fs/promises')
    await rm(scriptPath, { force: true }).catch(() => {})
  }
}

export function pickHostScript(
  scripts: LCScript[] | undefined,
  type: string
): LCScript | undefined {
  return (scripts ?? []).find(
    (script) =>
      scriptTypeName(script.Type) === type &&
      scriptMatchesHost(script.Platforms)
  )
}
