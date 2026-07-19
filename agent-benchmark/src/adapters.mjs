import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, realpath as resolveRealpath, stat } from 'node:fs/promises'
import { delimiter, extname, isAbsolute, resolve } from 'node:path'

const MAX_PROBE_TIMEOUT_MS = 3000
const MAX_CAPTURE_BYTES = 256 * 1024
const CODEX_EFFORT_VALUES = ['minimal', 'low', 'medium', 'high', 'xhigh']
const CLAUDE_EFFORT_VALUES = ['low', 'medium', 'high', 'xhigh', 'max']
const EFFORT_VERSION_COMPATIBILITY = Object.freeze({
  codex: Object.freeze([
    Object.freeze({ pattern: /^0\.144\.\d+$/, values: CODEX_EFFORT_VALUES }),
  ]),
  claude: Object.freeze([
    Object.freeze({ pattern: /^2\.1\.(?:214|215)$/, values: CLAUDE_EFFORT_VALUES }),
  ]),
})

const ADAPTERS = Object.freeze({
  codex: Object.freeze({
    id: 'codex',
    command: 'codex',
    displayName: 'Codex CLI',
    versionCommands: Object.freeze([Object.freeze(['--version'])]),
    helpCommand: Object.freeze(['exec', '--help']),
  }),
  claude: Object.freeze({
    id: 'claude',
    command: 'claude',
    displayName: 'Claude Code',
    versionCommands: Object.freeze([
      Object.freeze(['--version']),
      Object.freeze(['-v']),
    ]),
    helpCommand: Object.freeze(['--help']),
  }),
})

const ADAPTER_ALIASES = Object.freeze({
  'claude-code': 'claude',
})

function adapterIdOf(adapter) {
  if (typeof adapter === 'string') return ADAPTER_ALIASES[adapter] ?? adapter
  if (adapter && typeof adapter.id === 'string') return ADAPTER_ALIASES[adapter.id] ?? adapter.id
  return ''
}

export function getAdapter(adapter) {
  const id = adapterIdOf(adapter)
  const definition = ADAPTERS[id]
  if (!definition) throw new Error(`Unsupported agent adapter: ${id || String(adapter)}`)
  return definition
}

function boundedTimeout(timeoutMs) {
  if (!Number.isFinite(timeoutMs)) return MAX_PROBE_TIMEOUT_MS
  return Math.max(1, Math.min(Math.trunc(timeoutMs), MAX_PROBE_TIMEOUT_MS))
}

async function isExecutableFile(path) {
  try {
    const details = await stat(path)
    if (!details.isFile()) return false
    await access(path, process.platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

function executableNames(command, env) {
  if (process.platform !== 'win32' || extname(command)) return [command]
  const extensions = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(Boolean)
  return [command, ...extensions.map(extension => `${command}${extension.toLowerCase()}`)]
}

async function discoverExecutable(command, explicitPath, env, cwd) {
  if (explicitPath !== undefined) {
    if (typeof explicitPath !== 'string' || explicitPath.length === 0) {
      throw new TypeError('Explicit adapter executable must be a non-empty path')
    }
    const path = isAbsolute(explicitPath) ? resolve(explicitPath) : resolve(cwd, explicitPath)
    if (!await isExecutableFile(path)) return null
    return {
      executable: path,
      realpath: await resolveRealpath(path),
      discoverySource: 'explicit',
    }
  }

  const pathValue = env.PATH ?? env.Path ?? env.path ?? ''
  const names = executableNames(command, env)
  for (const entry of pathValue.split(delimiter)) {
    const directory = entry.length > 0 ? entry.replace(/^"|"$/g, '') : cwd
    for (const name of names) {
      const path = resolve(directory, name)
      if (!await isExecutableFile(path)) continue
      return {
        executable: path,
        realpath: await resolveRealpath(path),
        discoverySource: 'path',
      }
    }
  }
  return null
}

function appendCaptured(current, chunk) {
  if (Buffer.byteLength(current) >= MAX_CAPTURE_BYTES) return current
  const remaining = MAX_CAPTURE_BYTES - Buffer.byteLength(current)
  return current + chunk.toString('utf8', 0, remaining)
}

function unstartedCommand(args, timedOut = false) {
  return {
    args: [...args],
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut,
    durationMs: 0,
    error: null,
  }
}

function runCommand(executable, args, { cwd, env, timeoutMs }) {
  return new Promise(resolveResult => {
    const startedAt = Date.now()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let spawnError = null
    let settled = false
    let child
    let timer

    const finish = (exitCode, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveResult({
        args: [...args],
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
        error: spawnError?.message ?? null,
      })
    }

    try {
      child = spawn(executable, args, {
        cwd,
        detached: process.platform !== 'win32',
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (error) {
      spawnError = error instanceof Error ? error : new Error(String(error))
      finish(null, null)
      return
    }

    timer = setTimeout(() => {
      timedOut = true
      try {
        if (process.platform === 'win32') {
          child.kill('SIGKILL')
        } else {
          process.kill(-child.pid, 'SIGKILL')
        }
      } catch {
        child.kill('SIGKILL')
      }
      child.stdout.destroy()
      child.stderr.destroy()
      finish(null, 'SIGKILL')
    }, timeoutMs)
    timer.unref?.()

    child.stdout.on('data', chunk => {
      stdout = appendCaptured(stdout, chunk)
    })
    child.stderr.on('data', chunk => {
      stderr = appendCaptured(stderr, chunk)
    })
    child.on('error', error => {
      spawnError = error
    })
    child.on('close', finish)
  })
}

function normalizeVersion(line) {
  const match = line?.match(/(?:^|[^0-9])v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?:$|[^0-9])/)
  return match?.[1] ?? null
}

function versionLine(result) {
  if (result.exitCode !== 0 || result.timedOut || result.error) return null
  const stdoutLines = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const stdoutVersion = stdoutLines.find(line => normalizeVersion(line))
  if (stdoutVersion) return stdoutVersion

  const stderrLines = result.stderr.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const stderrVersion = stderrLines.find(line => normalizeVersion(line))
  return stderrVersion ?? stdoutLines[0] ?? null
}

async function probeVersion(definition, executable, options, deadline) {
  const attempts = []
  let best = null

  for (const args of definition.versionCommands) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    const result = await runCommand(executable, args, {
      ...options,
      timeoutMs: Math.max(1, remaining),
    })
    attempts.push(result)
    const raw = versionLine(result)
    if (raw && !best) best = { raw, normalized: normalizeVersion(raw), result }
    if (raw && normalizeVersion(raw)) {
      return { raw, normalized: normalizeVersion(raw), result, attempts }
    }
  }

  const result = best?.result ?? attempts.at(-1)
    ?? unstartedCommand(definition.versionCommands[0], true)
  return {
    raw: best?.raw ?? null,
    normalized: best?.normalized ?? null,
    result,
    attempts,
  }
}

function flagPattern(flag) {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[\\s,])${escaped}(?=$|[\\s=<\\[])`, 'm')
}

function supportsFlag(help, flag) {
  return flagPattern(flag).test(help)
}

function supportedClaudeEfforts(help) {
  const effortSection = help.match(/--effort[^\n]*(?:\n\s+[^\n]*){0,2}/)?.[0] ?? ''
  const values = CLAUDE_EFFORT_VALUES.filter(value =>
    new RegExp(`(^|[^a-z])${value}([^a-z]|$)`, 'i').test(effortSection))
  return values
}

function compatibleEfforts(definition, versionNormalized) {
  if (!versionNormalized) return []
  const match = EFFORT_VERSION_COMPATIBILITY[definition.id]
    ?.find(entry => entry.pattern.test(versionNormalized))
  return match ? [...match.values] : []
}

function capabilitiesFor(definition, helpResult, versionNormalized = null) {
  const help = helpResult.exitCode === 0 && !helpResult.timedOut && !helpResult.error
    ? helpResult.stdout
    : ''
  const modelSupported = supportsFlag(help, '--model')

  if (definition.id === 'codex') {
    const effortValues = compatibleEfforts(definition, versionNormalized)
    const effortSupported = supportsFlag(help, '--config') && effortValues.length > 0
    const workspaceSupported = supportsFlag(help, '--cd')
    const sandboxSupported = supportsFlag(help, '--sandbox')
    return {
      model: {
        supported: modelSupported,
        flag: modelSupported ? '--model' : null,
      },
      effort: {
        supported: effortSupported,
        flag: effortSupported ? '--config' : null,
        argumentStyle: effortSupported ? 'config' : null,
        configKey: effortSupported ? 'model_reasoning_effort' : null,
        values: effortSupported ? effortValues : [],
      },
      workspace: {
        supported: workspaceSupported,
        flag: workspaceSupported ? '--cd' : null,
      },
      sandbox: {
        supported: sandboxSupported,
        flag: sandboxSupported ? '--sandbox' : null,
        safeValue: sandboxSupported ? 'workspace-write' : null,
      },
      nonInteractive: /\bcodex\s+exec\b|non-interactive/i.test(help),
      structuredOutput: supportsFlag(help, '--json'),
      ephemeral: supportsFlag(help, '--ephemeral'),
    }
  }

  const declaredEfforts = supportedClaudeEfforts(help)
  const effortValues = declaredEfforts.length > 0
    ? declaredEfforts
    : compatibleEfforts(definition, versionNormalized)
  const effortSupported = supportsFlag(help, '--effort') && effortValues.length > 0
  const sandboxSupported = supportsFlag(help, '--permission-mode')
  const acceptEditsSupported = /--permission-mode[^\n]*(?:\n\s+[^\n]*){0,3}\bacceptEdits\b/.test(help)
  return {
    model: {
      supported: modelSupported,
      flag: modelSupported ? '--model' : null,
    },
    effort: {
      supported: effortSupported,
      flag: effortSupported ? '--effort' : null,
      argumentStyle: effortSupported ? 'flag' : null,
      configKey: null,
      values: effortSupported ? effortValues : [],
    },
    workspace: {
      supported: false,
      flag: null,
    },
    sandbox: {
      supported: sandboxSupported,
      flag: sandboxSupported ? '--permission-mode' : null,
      safeValue: acceptEditsSupported ? 'acceptEdits' : null,
    },
    nonInteractive: supportsFlag(help, '--print'),
    structuredOutput: supportsFlag(help, '--output-format'),
    ephemeral: supportsFlag(help, '--no-session-persistence'),
    safeMode: supportsFlag(help, '--safe-mode'),
  }
}

function capabilityWarnings(definition, version, helpResult, capabilities) {
  const warnings = []
  if (!version.normalized) warnings.push('无法解析 CLI 版本；仅建议使用手动交接模式。')
  if (helpResult.exitCode !== 0 || helpResult.timedOut || helpResult.error) {
    warnings.push('无法读取 CLI 帮助，模型和思考深度能力未知。')
  }
  if (!capabilities.model.supported) warnings.push('当前 CLI 帮助未声明显式模型参数。')
  if (!capabilities.effort.supported) warnings.push('当前 CLI 帮助未声明显式思考深度参数。')
  if (definition.id === 'codex' && capabilities.effort.supported) {
    warnings.push('Codex 思考深度通过通用配置覆盖传递；实际模型仍可能拒绝该值。')
  }
  return warnings
}

export async function probeAdapter(adapter, options = {}) {
  const definition = getAdapter(adapter)
  const env = options.env ?? process.env
  const cwd = resolve(options.cwd ?? process.cwd())
  const timeoutMs = boundedTimeout(options.timeoutMs ?? MAX_PROBE_TIMEOUT_MS)
  const probedAt = new Date().toISOString()
  const deadline = Date.now() + timeoutMs
  const discovered = await discoverExecutable(
    definition.command,
    options.executable ?? options.executablePath,
    env,
    cwd,
  )

  if (!discovered) {
    return {
      snapshotType: 'planned',
      executionConfigVerified: false,
      adapterId: definition.id,
      displayName: definition.displayName,
      command: definition.command,
      found: false,
      available: false,
      executable: null,
      realpath: null,
      discoverySource: options.executable ?? options.executablePath ? 'explicit' : 'path',
      versionRaw: null,
      versionNormalized: null,
      probedAt,
      capabilities: capabilitiesFor(definition, unstartedCommand(definition.helpCommand)),
      warnings: [`未找到 ${definition.displayName} 可执行文件。`],
      diagnostics: {
        version: null,
        versionAttempts: [],
        help: null,
      },
    }
  }

  const commandOptions = { cwd, env }
  const versionPromise = probeVersion(
    definition,
    discovered.executable,
    commandOptions,
    deadline,
  )
  const helpRemaining = deadline - Date.now()
  const helpPromise = helpRemaining > 0
    ? runCommand(discovered.executable, definition.helpCommand, {
        ...commandOptions,
        timeoutMs: helpRemaining,
      })
    : Promise.resolve(unstartedCommand(definition.helpCommand, true))
  const [version, helpResult] = await Promise.all([versionPromise, helpPromise])
  const capabilities = capabilitiesFor(definition, helpResult, version.normalized)

  return {
    snapshotType: 'planned',
    executionConfigVerified: false,
    adapterId: definition.id,
    displayName: definition.displayName,
    command: definition.command,
    found: true,
    available: true,
    executable: discovered.executable,
    realpath: discovered.realpath,
    discoverySource: discovered.discoverySource,
    versionRaw: version.raw,
    versionNormalized: version.normalized,
    probedAt,
    capabilities,
    warnings: capabilityWarnings(definition, version, helpResult, capabilities),
    diagnostics: {
      version: version.result,
      versionAttempts: version.attempts,
      help: helpResult,
    },
  }
}

export async function probeAdapters(options = {}) {
  return Promise.all(Object.keys(ADAPTERS).map(adapterId =>
    probeAdapter(adapterId, {
      ...options,
      executable: options.executables?.[adapterId],
    })))
}

function isDefaultChoice(value) {
  return value === undefined || value === null || value === '' || value === 'default'
}

function shellQuote(value) {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new TypeError('Shell command values must be strings without NUL bytes')
  }
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function assertCapability(capability, description) {
  if (!capability?.supported) {
    throw new Error(`The probed adapter does not support ${description}`)
  }
}

function assertEffortValue(capability, effort) {
  if (!/^[a-z][a-z0-9_-]*$/i.test(effort)) {
    throw new Error(`Invalid reasoning effort: ${effort}`)
  }
  if (capability.values.length > 0 && !capability.values.includes(effort)) {
    throw new Error(`The probed adapter does not support reasoning effort ${effort}`)
  }
}

function modelCapabilityFor(capabilities) {
  const model = capabilities.model
  const supported = model === true || model?.supported === true
  return {
    supported,
    flag: supported ? model?.flag ?? '--model' : null,
  }
}

function effortCapabilityFor(definition, capabilities) {
  const effort = capabilities.effort
  const legacyValues = capabilities.efforts ?? capabilities.effortValues
  const values = effort?.values ?? (Array.isArray(legacyValues)
    ? legacyValues.filter(value => value !== 'default')
    : [])
  const supported = effort === true
    || effort?.supported === true
    || values.length > 0
  const configStyle = definition.id === 'codex'
  return {
    supported,
    flag: supported
      ? effort?.flag ?? (configStyle ? '--config' : '--effort')
      : null,
    argumentStyle: supported
      ? effort?.argumentStyle ?? (configStyle ? 'config' : 'flag')
      : null,
    configKey: supported && configStyle
      ? effort?.configKey ?? 'model_reasoning_effort'
      : null,
    values,
  }
}

function commandArguments(definition, probe, workspace, model, effort) {
  const capabilities = probe?.capabilities ?? {}
  const modelCapability = modelCapabilityFor(capabilities)
  const effortCapability = effortCapabilityFor(definition, capabilities)
  const args = definition.id === 'codex' ? ['exec'] : []

  if (definition.id === 'codex') {
    if (capabilities.sandbox?.supported) {
      args.push(capabilities.sandbox.flag, capabilities.sandbox.safeValue)
    }
    if (capabilities.ephemeral) args.push('--ephemeral')
    if (workspace && capabilities.workspace?.supported) {
      args.push(capabilities.workspace.flag, workspace)
    }
  } else {
    if (capabilities.nonInteractive) args.push('--print')
    if (capabilities.safeMode) args.push('--safe-mode')
    if (capabilities.ephemeral) args.push('--no-session-persistence')
    if (capabilities.sandbox?.supported && capabilities.sandbox.safeValue) {
      args.push(capabilities.sandbox.flag, capabilities.sandbox.safeValue)
    }
  }

  if (!isDefaultChoice(model)) {
    assertCapability(modelCapability, 'an explicit model')
    args.push(modelCapability.flag, model)
  }

  if (!isDefaultChoice(effort)) {
    assertCapability(effortCapability, 'an explicit reasoning effort')
    assertEffortValue(effortCapability, effort)
    if (effortCapability.argumentStyle === 'config') {
      args.push(
        effortCapability.flag,
        `${effortCapability.configKey}=${JSON.stringify(effort)}`,
      )
    } else {
      args.push(effortCapability.flag, effort)
    }
  }

  if (definition.id === 'codex') args.push('-')
  return args
}

const FORBIDDEN_ARGUMENTS = new Set([
  '--dangerously-bypass-approvals-and-sandbox',
  '--dangerously-bypass-hook-trust',
  '--dangerously-skip-permissions',
  '--allow-dangerously-skip-permissions',
  '--add-dir',
  'danger-full-access',
  'bypassPermissions',
])

export function buildHandoffCommand({
  adapter,
  adapterId,
  probe,
  workspace,
  model = 'default',
  effort = 'default',
} = {}) {
  const definition = getAdapter(adapter ?? adapterId ?? probe?.adapterId)
  if (probe?.adapterId && probe.adapterId !== definition.id) {
    throw new Error('Adapter and probe snapshot do not match')
  }
  if (probe && probe.found === false) {
    throw new Error(`${definition.displayName} executable was not found`)
  }
  if (workspace !== undefined && (!isAbsolute(workspace) || workspace.includes('\0'))) {
    throw new Error('Handoff workspace must be an absolute path')
  }
  if (!isDefaultChoice(model) && (typeof model !== 'string' || model.includes('\0'))) {
    throw new TypeError('Requested model must be a string without NUL bytes')
  }
  if (!isDefaultChoice(effort) && typeof effort !== 'string') {
    throw new TypeError('Requested reasoning effort must be a string')
  }

  const executable = probe?.executable ?? probe?.realpath ?? definition.command
  const args = commandArguments(definition, probe, workspace, model, effort)
  if (args.some(argument => FORBIDDEN_ARGUMENTS.has(argument))) {
    throw new Error('Refusing to build a handoff command with unsafe bypass arguments')
  }

  const invocation = [executable, ...args].map(shellQuote).join(' ')
  const command = `${invocation} < ${shellQuote('.benchmark-task.md')}`
  return workspace ? `cd ${shellQuote(workspace)} && ${command}` : command
}
