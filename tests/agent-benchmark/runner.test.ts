import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { test } from 'vitest'

// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import { loadManifest } from '../../agent-benchmark/src/catalog.mjs'
// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import { BenchmarkRepository } from '../../agent-benchmark/src/repository.mjs'
// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import { BenchmarkRunner } from '../../agent-benchmark/src/runner.mjs'
// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import { ScriptedTerminal } from '../../agent-benchmark/src/terminal.mjs'

const testCwd = process.cwd()
const repoRoot = basename(testCwd) === 'agent-benchmark' ? resolve(testCwd, '..') : testCwd
const manifest = loadManifest(join(repoRoot, 'agent-benchmark', 'benchmarks.json'))

const probes = {
  codex: {
    id: 'codex',
    displayName: 'Codex CLI',
    found: true,
    executable: '/tmp/fake-codex',
    realpath: '/tmp/fake-codex',
    versionRaw: 'codex-cli 0.144.5',
    versionNormalized: '0.144.5',
    probedAt: '2026-07-19T00:00:00.000Z',
    capabilities: {
      model: true,
      efforts: ['default', 'low', 'medium', 'high', 'xhigh'],
    },
    diagnostics: [],
  },
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    found: true,
    executable: '/tmp/fake-claude',
    realpath: '/tmp/fake-claude',
    versionRaw: '2.1.214 (Claude Code)',
    versionNormalized: '2.1.214',
    probedAt: '2026-07-19T00:00:00.000Z',
    capabilities: {
      model: true,
      efforts: ['default', 'low', 'medium', 'high'],
    },
    diagnostics: [],
  },
}

function createRunner(
  temporaryRoot: string,
  terminal: InstanceType<typeof ScriptedTerminal>,
): {
  repository: InstanceType<typeof BenchmarkRepository>
  runner: InstanceType<typeof BenchmarkRunner>
} {
  const repository = new BenchmarkRepository(join(temporaryRoot, 'benchmark.sqlite3'))
  const runner = new BenchmarkRunner({
    manifest,
    repoRoot,
    runtimeRoot: temporaryRoot,
    repository,
    terminal,
    probeAdapters: async () => probes,
    createId: () => '0b388276-5b75-4e1d-bcc8-f1c4e78ac015',
    now: () => new Date('2026-07-19T00:00:00.000Z'),
  })
  return { repository, runner }
}

test('Chinese home probes both CLIs and can exit without creating a Run', async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-runner-home-'))
  const terminal = new ScriptedTerminal(['exit'])
  const { repository, runner } = createRunner(temporaryRoot, terminal)

  try {
    const result = await runner.home()

    assert.deepEqual(result, { action: 'exit' })
    assert.match(terminal.output, /Paper Agent Benchmark v2/)
    assert.match(terminal.output, /环境检查/)
    assert.match(terminal.output, /Codex CLI.*0\.144\.5/)
    assert.match(terminal.output, /Claude Code.*2\.1\.214/)
    assert.match(terminal.output, /开始新的评测/)
    assert.equal(repository.listRuns().length, 0)
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('home ignores ad-hoc evaluation records and direct resume explains the incompatibility', async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-runner-ad-hoc-'))
  const terminal = new ScriptedTerminal(['exit'])
  const { repository, runner } = createRunner(temporaryRoot, terminal)
  const runId = '11111111-1111-4111-8111-111111111111'

  try {
    repository.createRun({
      id: runId,
      caseId: 'hash-scroll-restoration',
      title: '修复异步页面中的锚点滚动恢复',
      baseTree: 'a'.repeat(40),
      benchmarkManifestHash: 'b'.repeat(64),
      promptVersion: null,
      promptProvenance: 'legacy_unverified',
      promptText: null,
      promptHash: null,
      adapterId: null,
      adapterDisplayName: null,
      executablePath: null,
      executableRealpath: null,
      versionRaw: null,
      versionNormalized: null,
      capabilities: {},
      requestedModel: null,
      requestedEffort: null,
      adapterEffortValue: null,
      runMode: 'ad-hoc',
      executionConfigVerified: false,
      executionConfigSource: 'unknown',
      dependencyStrategy: 'unknown',
      workspace: join(temporaryRoot, 'legacy-workspace'),
      status: 'ready_for_evaluation',
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
    })

    await runner.home()

    assert.doesNotMatch(terminal.output, /有 1 个未完成评测/)
    await assert.rejects(
      runner.resume(runId, { waitForHandoff: false, quiet: true }),
      /ad-hoc.*不能通过 resume 恢复/,
    )
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('cancelling the final wizard confirmation creates neither Run nor workspace', async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-runner-cancel-'))
  const terminal = new ScriptedTerminal([
    'hash-scroll-restoration',
    'codex',
    'default',
    'high',
    'handoff',
    'isolated',
    false,
  ])
  const { repository, runner } = createRunner(temporaryRoot, terminal)

  try {
    const result = await runner.runWizard({ waitForHandoff: false })

    assert.equal(result.cancelled, true)
    assert.equal(repository.listRuns().length, 0)
    assert.equal(
      existsSync(join(
        temporaryRoot,
        'workspaces',
        'hash-scroll-restoration',
        '0b388276-5b75-4e1d-bcc8-f1c4e78ac015',
      )),
      false,
    )
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('confirmed handoff creates a unique v2 workspace and persistent prepared Run', async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-runner-create-'))
  const terminal = new ScriptedTerminal([
    'hash-scroll-restoration',
    'claude',
    'default',
    'high',
    'handoff',
    'isolated',
    true,
  ])
  const { repository, runner } = createRunner(temporaryRoot, terminal)

  try {
    const result = await runner.runWizard({ waitForHandoff: false })
    const run = repository.getRun('0b388276')

    assert.equal(result.cancelled, false)
    assert.equal(run.status, 'prepared')
    assert.equal(run.runMode, 'handoff')
    assert.equal(run.executionConfigVerified, false)
    assert.equal(run.requestedModel, 'default')
    assert.equal(run.requestedEffort, 'high')
    assert.ok(existsSync(run.workspace))
    assert.equal(readFileSync(join(run.workspace, '.benchmark-task.md'), 'utf8'), run.promptText)
    assert.match(terminal.output, /环境已准备/)
    assert.match(terminal.output, /准备时探测，实际执行未验证/)
    assert.match(terminal.output, /PROMPT BEGIN/)
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
