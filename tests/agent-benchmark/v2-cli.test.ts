import assert from 'node:assert/strict'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, join, resolve } from 'node:path'
import { test } from 'vitest'

const testCwd = process.cwd()
const repoRoot = basename(testCwd) === 'agent-benchmark' ? resolve(testCwd, '..') : testCwd
const cliPath = join(repoRoot, 'agent-benchmark', 'cli.mjs')

interface CliFixture {
  root: string
  log: string
  env: NodeJS.ProcessEnv
  db: string
  workspace: string
  results: string
}

interface CreatedRun {
  type: string
  run: {
    id: string
    status: string
    workspace: string
    promptText: string
    promptHash: string
    executionConfigVerified: boolean
    adapterId: string
    versionNormalized: string
  }
  handoffCommand: string
}

function runCli(
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv
    timeout?: number
  } = {},
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    timeout: options.timeout ?? 30_000,
    maxBuffer: 20 * 1024 * 1024,
  })
}

function writeFakeCli(path: string, adapter: 'codex' | 'claude'): void {
  const version = adapter === 'codex'
    ? 'codex-cli 0.144.5'
    : '2.1.214 (Claude Code)'
  const help = adapter === 'codex'
    ? `Run Codex non-interactively
Usage: codex exec [OPTIONS] [PROMPT]
  --model <MODEL>
  --config <key=value>
  --sandbox <MODE>
  --cd <DIR>
  --ephemeral
  --json`
    : `Claude Code
  --model <model>
  --effort <level> choices: low, medium, high, xhigh, max
  --print
  --output-format <format>
  --no-session-persistence
  --safe-mode
  --permission-mode <mode>`
  const source = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
if (process.env.FAKE_CLI_LOG) {
  appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify({ adapter: ${JSON.stringify(adapter)}, args }) + '\\n')
}
if (args.includes('--version') || args.includes('-v')) {
  console.log(${JSON.stringify(version)})
  console.error('wrapper warning from fake ${adapter}')
  process.exit(0)
}
if (args.includes('--help')) {
  console.log(${JSON.stringify(help)})
  process.exit(0)
}
console.error('fake CLI must never receive a model request during handoff preparation')
process.exit(91)
`
  writeFileSync(path, source)
  chmodSync(path, 0o755)
}

function fixture(): CliFixture {
  const root = mkdtempSync(join(tmpdir(), 'paper-benchmark-v2-cli-'))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const log = join(root, 'fake-cli.jsonl')
  writeFakeCli(join(bin, 'codex'), 'codex')
  writeFakeCli(join(bin, 'claude'), 'claude')
  const allowedEnvironment = [
    'HOME',
    'USERPROFILE',
    'TMPDIR',
    'TEMP',
    'TMP',
    'LANG',
    'LC_ALL',
    'SYSTEMROOT',
    'SystemRoot',
    'COMSPEC',
    'ComSpec',
    'PATHEXT',
  ]
  const env = Object.fromEntries(
    allowedEnvironment
      .filter(name => process.env[name] !== undefined)
      .map(name => [name, process.env[name]]),
  ) as NodeJS.ProcessEnv
  Object.assign(env, {
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    FAKE_CLI_LOG: log,
    NO_COLOR: '1',
  })
  return {
    root,
    log,
    env,
    db: join(root, 'benchmark.sqlite3'),
    workspace: join(root, 'workspace'),
    results: join(root, 'results'),
  }
}

function createRun(
  current: CliFixture,
  adapter: 'codex' | 'claude' = 'codex',
  workspace = current.workspace,
): CreatedRun {
  const result = runCli([
    '--db',
    current.db,
    'run',
    '--case',
    'hash-scroll-restoration',
    '--adapter',
    adapter,
    '--model',
    'default',
    '--effort',
    'high',
    '--mode',
    'handoff',
    '--dependency-strategy',
    'isolated',
    '--workspace',
    workspace,
    '--yes',
    '--json',
    '--no-color',
  ], { env: current.env, timeout: 90_000 })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout) as CreatedRun
}

test('non-TTY run fails fast with every missing wizard choice', () => {
  const current = fixture()

  try {
    const result = runCli(['run', '--db', current.db, '--json'], {
      env: current.env,
      timeout: 5_000,
    })

    assert.equal(result.status, 2)
    assert.match(result.stderr, /非交互 run 缺少必填参数/)
    assert.match(result.stderr, /--case/)
    assert.match(result.stderr, /--adapter/)
    assert.match(result.stderr, /--model/)
    assert.match(result.stderr, /--effort/)
    assert.match(result.stderr, /--yes/)
  } finally {
    rmSync(current.root, { recursive: true, force: true })
  }
})

test('handoff run probes both CLIs, persists a unique workspace, and resumes by prefix', () => {
  const current = fixture()

  try {
    const created = createRun(current)
    assert.equal(created.type, 'run')
    assert.equal(created.run.status, 'prepared')
    assert.equal(created.run.adapterId, 'codex')
    assert.equal(created.run.versionNormalized, '0.144.5')
    assert.equal(created.run.executionConfigVerified, false)
    assert.equal(created.run.workspace, current.workspace)
    assert.equal(
      readFileSync(join(current.workspace, '.benchmark-task.md'), 'utf8'),
      created.run.promptText,
    )
    const session = JSON.parse(
      readFileSync(join(current.workspace, '.benchmark-session.json'), 'utf8'),
    ) as { schemaVersion: number; runId: string; promptHash: string }
    assert.equal(session.schemaVersion, 2)
    assert.equal(session.runId, created.run.id)
    assert.equal(session.promptHash, created.run.promptHash)
    assert.equal(readFileSync(current.db).subarray(0, 16).toString(), 'SQLite format 3\0')
    assert.match(created.handoffCommand, /\.benchmark-task\.md/)
    assert.doesNotMatch(created.handoffCommand, /dangerously|bypassPermissions/)

    const resumed = runCli([
      'resume',
      created.run.id.slice(0, 8),
      '--db',
      current.db,
      '--json',
    ], { env: current.env })
    assert.equal(resumed.status, 0, resumed.stderr)
    const resumePayload = JSON.parse(resumed.stdout) as {
      run: { id: string; workspace: string; promptText: string }
      handoffCommand: string
    }
    assert.equal(resumePayload.run.id, created.run.id)
    assert.equal(resumePayload.run.workspace, created.run.workspace)
    assert.equal(resumePayload.run.promptText, created.run.promptText)
    assert.equal(resumePayload.handoffCommand, created.handoffCommand)

    const downgraded = runCli([
      'evaluate',
      'hash-scroll-restoration',
      '--workspace',
      current.workspace,
      '--db',
      current.db,
      '--json',
    ], { env: current.env })
    assert.equal(downgraded.status, 2)
    assert.match(downgraded.stderr, /v2 workspace.*Run ID/)

    const invocations = readFileSync(current.log, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as { args: string[] })
    assert.ok(invocations.some(entry => entry.args.includes('--version')))
    assert.ok(invocations.some(entry => entry.args.includes('--help')))
    assert.ok(invocations.every(entry => (
      entry.args.includes('--version')
      || entry.args.includes('-v')
      || entry.args.includes('--help')
    )))
  } finally {
    rmSync(current.root, { recursive: true, force: true })
  }
}, 90_000)

test('Run ID evaluate completes a low-scoring baseline and persists primary details', () => {
  const current = fixture()

  try {
    const created = createRun(current)
    writeFileSync(join(current.workspace, 'candidate-note.txt'), 'candidate bytes\n')

    const evaluated = runCli([
      'evaluate',
      created.run.id.slice(0, 8),
      '--db',
      current.db,
      '--results',
      current.results,
      '--json',
    ], { env: current.env, timeout: 180_000 })
    assert.equal(evaluated.status, 0, evaluated.stderr)
    const report = JSON.parse(evaluated.stdout) as {
      score: number
      maxScore: number
      candidateFingerprint: string
      checks: Array<{ detailsHidden: boolean }>
    }
    assert.ok(report.score < report.maxScore)
    assert.match(report.candidateFingerprint, /^[0-9a-f]{64}$/)
    assert.ok(report.checks.every(check => check.detailsHidden))

    const result = runCli([
      '--db',
      current.db,
      'result',
      created.run.id,
      '--json',
    ], { env: current.env })
    assert.equal(result.status, 0, result.stderr)
    const stored = JSON.parse(result.stdout) as {
      run: {
        status: string
        primaryEvaluationId: string
        latestEvaluationId: string
      }
      evaluations: Array<{
        id: string
        status: string
        isPrimary: boolean
        checks: unknown[]
      }>
    }
    assert.equal(stored.run.status, 'completed')
    assert.equal(stored.run.primaryEvaluationId, stored.run.latestEvaluationId)
    assert.equal(stored.evaluations.length, 1)
    assert.equal(stored.evaluations[0]?.id, stored.run.primaryEvaluationId)
    assert.equal(stored.evaluations[0]?.status, 'completed')
    assert.equal(stored.evaluations[0]?.isPrimary, true)
    assert.ok(stored.evaluations[0]?.checks.length)
  } finally {
    rmSync(current.root, { recursive: true, force: true })
  }
}, 200_000)
