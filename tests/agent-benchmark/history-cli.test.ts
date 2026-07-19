import assert from 'node:assert/strict'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { test } from 'vitest'

// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import { BenchmarkRepository } from '../../agent-benchmark/src/repository.mjs'

const testCwd = process.cwd()
const repoRoot = basename(testCwd) === 'agent-benchmark' ? resolve(testCwd, '..') : testCwd
const cliPath = join(repoRoot, 'agent-benchmark', 'cli.mjs')

const RUN_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const RUN_B = 'bbbbbbbb-2222-4222-8222-222222222222'
const EVALUATION_A_PRIMARY = '11111111-aaaa-4111-8111-111111111111'
const EVALUATION_A_ITERATION = '44444444-aaaa-4444-8444-444444444444'
const EVALUATION_A_LATEST = '22222222-aaaa-4222-8222-222222222222'
const EVALUATION_B_PRIMARY = '33333333-bbbb-4333-8333-333333333333'

function runCli(args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  })
}

function makeRun(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    caseId: 'hash-scroll-restoration',
    title: '修复异步页面中的锚点滚动恢复',
    baseTree: 'a'.repeat(40),
    benchmarkManifestHash: 'b'.repeat(64),
    promptVersion: '1.0',
    promptProvenance: 'generated',
    promptText: 'safe prompt',
    promptHash: 'c'.repeat(64),
    adapterId: 'codex',
    adapterDisplayName: 'Codex CLI',
    executablePath: '/usr/local/bin/codex',
    executableRealpath: '/usr/local/bin/codex',
    versionRaw: 'codex-cli 0.144.5',
    versionNormalized: '0.144.5',
    capabilities: {},
    requestedModel: 'default',
    requestedEffort: 'high',
    adapterEffortValue: 'high',
    runMode: 'handoff',
    executionConfigVerified: false,
    executionConfigSource: 'planned',
    permissionPolicy: 'workspace-write',
    writeIsolation: 'workspace',
    secretIsolation: 'filtered',
    toolNetworkIsolation: 'unknown',
    dependencyStrategy: 'isolated',
    workspace: `/tmp/history-cli/${id}`,
    status: 'ready_for_evaluation',
    agentDurationMs: 12_000,
    inputTokens: 1_000,
    outputTokens: 250,
    cachedTokens: 100,
    reasoningTokens: 50,
    cost: 0.42,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  }
}

function makeReport(score: number): Record<string, unknown> {
  return {
    schemaVersion: 1,
    caseId: 'hash-scroll-restoration',
    title: '修复异步页面中的锚点滚动恢复',
    workspace: '/tmp/private-workspace',
    startedAt: '2026-07-18T01:00:00.000Z',
    durationMs: 1_000,
    score,
    maxScore: 100,
    checks: [
      {
        id: 'behavior',
        kind: 'vitest',
        label: '行为回归测试',
        points: 70,
        passed: true,
        exitCode: 0,
        signal: null,
        durationMs: 400,
        detailsHidden: true,
      },
      {
        id: 'typecheck',
        kind: 'npm-script',
        label: 'TypeScript 类型检查',
        points: 15,
        passed: true,
        exitCode: 0,
        signal: null,
        durationMs: 300,
        detailsHidden: true,
      },
      {
        id: 'build',
        kind: 'npm-script',
        label: '生产构建',
        points: 15,
        passed: true,
        exitCode: 0,
        signal: null,
        durationMs: 300,
        detailsHidden: true,
      },
    ],
    scoring: {
      checks: { score: 85, maxScore: 85, weight: 80 },
      changedFiles: {
        candidateCount: 5,
        referenceCount: 6,
        matchedCount: 4,
        precision: 0.8,
        recall: 2 / 3,
        f1: 0.75,
        weight: 20,
      },
    },
    oracleFileCount: 4,
    dependencyMode: 'copy',
    evaluationDirectory: null,
    evaluationDirectories: [],
    reportFile: '/tmp/private-report.json',
    privateSentinel: 'oracle-secret-sentinel',
  }
}

function completeEvaluation(
  repository: InstanceType<typeof BenchmarkRepository>,
  runId: string,
  evaluationId: string,
  score: number,
  startedAt: string,
  finishedAt: string,
  postExposure = false,
): void {
  repository.beginEvaluation(runId, evaluationId, startedAt, `fingerprint-${evaluationId}`)
  repository.completeEvaluation(
    runId,
    evaluationId,
    makeReport(score),
    finishedAt,
    postExposure,
  )
}

function seedDatabase(
  databasePath: string,
  runBOverrides: Record<string, unknown> = {},
): void {
  const repository = new BenchmarkRepository(databasePath)
  try {
    repository.createRun(makeRun(RUN_A))
    completeEvaluation(
      repository,
      RUN_A,
      EVALUATION_A_PRIMARY,
      84.2,
      '2026-07-18T01:00:00.000Z',
      '2026-07-18T01:01:00.000Z',
    )
    completeEvaluation(
      repository,
      RUN_A,
      EVALUATION_A_ITERATION,
      87,
      '2026-07-18T01:30:00.000Z',
      '2026-07-18T01:31:00.000Z',
    )
    completeEvaluation(
      repository,
      RUN_A,
      EVALUATION_A_LATEST,
      91.5,
      '2026-07-18T02:00:00.000Z',
      '2026-07-18T02:01:00.000Z',
      true,
    )

    repository.createRun(makeRun(RUN_B, {
      adapterId: 'claude',
      adapterDisplayName: 'Claude Code',
      versionRaw: '2.1.215 (Claude Code)',
      versionNormalized: '2.1.215',
      updatedAt: '2026-07-18T03:00:00.000Z',
      ...runBOverrides,
    }))
    completeEvaluation(
      repository,
      RUN_B,
      EVALUATION_B_PRIMARY,
      88,
      '2026-07-18T03:00:00.000Z',
      '2026-07-18T03:01:00.000Z',
    )
  } finally {
    repository.close()
  }
}

test('results --json returns paginated safe summaries using primary scores', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-history-cli-'))
  const databasePath = join(temporaryRoot, 'benchmark.sqlite3')

  try {
    seedDatabase(databasePath)
    const result = runCli([
      '--db',
      databasePath,
      'results',
      '--limit',
      '1',
      '--json',
    ])

    assert.equal(result.status, 0, result.stderr)
    const payload = JSON.parse(result.stdout) as {
      schemaVersion: number
      type: string
      pagination: { total: number; limit: number; hasNext: boolean }
      results: Array<{
        id: string
        primaryEvaluation: { score: number } | null
      }>
    }
    assert.equal(payload.schemaVersion, 2)
    assert.equal(payload.type, 'results')
    assert.deepEqual(payload.pagination, {
      total: 2,
      limit: 1,
      offset: 0,
      hasPrevious: false,
      hasNext: true,
    })
    assert.equal(payload.results.length, 1)
    assert.equal(payload.results[0]?.id, RUN_B)
    assert.equal(payload.results[0]?.primaryEvaluation?.score, 88)
    assert.doesNotMatch(result.stdout, /oracle-secret-sentinel|private-workspace|private-report/)
    assert.equal(result.stderr, '')
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('results applies exact filters and inclusive local date bounds', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-history-cli-filter-'))
  const databasePath = join(temporaryRoot, 'benchmark.sqlite3')

  try {
    seedDatabase(databasePath)
    const result = runCli([
      'results',
      '--db',
      databasePath,
      '--case',
      'hash-scroll-restoration',
      '--adapter',
      'codex',
      '--model',
      'default',
      '--from',
      '2026-07-18',
      '--to',
      '2026-07-18',
      '--json',
    ])

    assert.equal(result.status, 0, result.stderr)
    const payload = JSON.parse(result.stdout) as {
      filters: {
        caseId: string
        adapterId: string
        requestedModel: string
        from: string
        to: string
      }
      pagination: { total: number }
      results: Array<{
        id: string
        primaryEvaluation: { score: number } | null
        hasLaterEvaluation: boolean
      }>
    }
    assert.deepEqual(payload.filters, {
      caseId: 'hash-scroll-restoration',
      adapterId: 'codex',
      requestedModel: 'default',
      from: '2026-07-18',
      to: '2026-07-18',
    })
    assert.equal(payload.pagination.total, 1)
    assert.equal(payload.results.length, 1)
    assert.equal(payload.results[0]?.id, RUN_A)
    assert.equal(payload.results[0]?.primaryEvaluation?.score, 84.2)
    assert.equal(payload.results[0]?.hasLaterEvaluation, true)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('results rejects invalid calendar dates, reversed ranges, and paging values', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-history-cli-invalid-'))
  const databasePath = join(temporaryRoot, 'benchmark.sqlite3')

  try {
    seedDatabase(databasePath)
    for (const [args, message] of [
      [['--from', '2026-02-30'], /not a valid calendar date/],
      [['--from', '2026-07-19', '--to', '2026-07-18'], /must not be after/],
      [['--limit', '0'], /must be between 1 and 100/],
      [['--offset', '-1'], /requires a value|must be an integer/],
    ] as Array<[string[], RegExp]>) {
      const result = runCli(['results', '--db', databasePath, ...args, '--json'])
      assert.equal(result.status, 2)
      assert.match(result.stderr, message)
      assert.equal(result.stdout, '')
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('compare --json defaults to primary evaluations and reports comparability warnings', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-compare-cli-'))
  const databasePath = join(temporaryRoot, 'benchmark.sqlite3')

  try {
    seedDatabase(databasePath)
    const result = runCli([
      '--db',
      databasePath,
      'compare',
      RUN_A.slice(0, 8),
      RUN_B.slice(0, 8),
      '--json',
    ])

    assert.equal(result.status, 0, result.stderr)
    const payload = JSON.parse(result.stdout) as {
      schemaVersion: number
      type: string
      comparability: {
        level: string
        warnings: Array<{ code: string; message: string }>
      }
      runA: { runId: string; evaluationId: string; score: number; isPrimary: boolean }
      runB: { runId: string; evaluationId: string; score: number; isPrimary: boolean }
    }
    assert.equal(payload.schemaVersion, 2)
    assert.equal(payload.type, 'comparison')
    assert.equal(payload.runA.runId, RUN_A)
    assert.equal(payload.runA.evaluationId, EVALUATION_A_PRIMARY)
    assert.equal(payload.runA.score, 84.2)
    assert.equal(payload.runA.isPrimary, true)
    assert.equal(payload.runB.runId, RUN_B)
    assert.equal(payload.runB.evaluationId, EVALUATION_B_PRIMARY)
    assert.equal(payload.runB.score, 88)
    assert.equal(payload.comparability.level, 'caution')
    assert.ok(payload.comparability.warnings.some(warning =>
      warning.code === 'EXECUTION_UNVERIFIED'))
    assert.doesNotMatch(result.stdout, /oracle-secret-sentinel|private-workspace|private-report/)
    assert.equal(result.stderr, '')
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('results human output shows the complete primary summary and latest marker', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-history-human-'))
  const databasePath = join(temporaryRoot, 'benchmark.sqlite3')

  try {
    seedDatabase(databasePath)
    const result = runCli([
      'results',
      '--db',
      databasePath,
      '--adapter',
      'codex',
    ])

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /aaaaaaaa.*hash-scroll-restoration.*completed/)
    assert.match(result.stdout, /Codex CLI.*0\.144\.5/)
    assert.match(result.stdout, /模型.*default.*思考深度.*high/)
    assert.match(result.stdout, /Primary.*84\.2\/100.*latest 另有结果/i)
    assert.match(result.stdout, /行为.*通过.*类型.*通过.*构建.*通过/)
    assert.match(result.stdout, /路径 F1.*75\.0%/)
    assert.match(result.stdout, /Agent 用时.*12\.0 秒/)
    assert.match(result.stdout, /评价时间.*2026-07-18T02:01:00\.000Z/)
    assert.match(result.stdout, /准备时探测，实际执行未验证/)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('results and compare reject unknown options instead of accepting --latest', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-history-cli-options-'))
  const databasePath = join(temporaryRoot, 'benchmark.sqlite3')

  try {
    seedDatabase(databasePath)
    for (const args of [
      ['results', '--latest'],
      ['compare', RUN_A, RUN_B, '--latest'],
    ]) {
      const result = runCli([...args, '--db', databasePath, '--json'])
      assert.equal(result.status, 2)
      assert.match(result.stderr, /不支持选项.*--latest/)
      assert.equal(result.stdout, '')
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('compare human output names both cases when cross-case results are inspected', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-compare-cross-case-'))
  const databasePath = join(temporaryRoot, 'benchmark.sqlite3')

  try {
    seedDatabase(databasePath, {
      caseId: 'auth-session-hardening',
      title: '强化会话校验与注册安全',
    })
    const result = runCli(['compare', RUN_A, RUN_B, '--db', databasePath])

    assert.equal(result.status, 0, result.stderr)
    assert.match(
      result.stdout,
      /Case.*hash-scroll-restoration.*auth-session-hardening/,
    )
    assert.match(result.stdout, /不是同一道 case/)
    assert.match(result.stdout, /INCOMPARABLE/)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('compare human output keeps agent and evaluation durations distinct', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-compare-human-'))
  const databasePath = join(temporaryRoot, 'benchmark.sqlite3')

  try {
    seedDatabase(databasePath)
    const result = runCli([
      'compare',
      RUN_A,
      RUN_B,
      '--db',
      databasePath,
    ])

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /对比.*aaaaaaaa.*bbbbbbbb/)
    assert.match(result.stdout, /Codex CLI.*0\.144\.5.*Claude Code.*2\.1\.215/)
    assert.match(result.stdout, /Requested model.*default.*default/)
    assert.match(result.stdout, /思考深度.*high.*high/)
    assert.match(result.stdout, /运行方式.*handoff.*handoff/)
    assert.match(result.stdout, /依赖策略.*isolated.*isolated/)
    assert.match(result.stdout, /权限策略.*workspace-write.*workspace-write/)
    assert.match(result.stdout, /Exposure.*blind.*blind/)
    assert.match(result.stdout, /总分.*84\.2\/100.*88\/100/)
    assert.match(result.stdout, /行为.*通过.*通过/)
    assert.match(result.stdout, /类型检查.*通过.*通过/)
    assert.match(result.stdout, /生产构建.*通过.*通过/)
    assert.match(result.stdout, /路径 F1.*75\.0%.*75\.0%/)
    assert.match(result.stdout, /Agent 用时.*12\.0 秒.*12\.0 秒/)
    assert.match(result.stdout, /评价耗时.*1\.0 秒.*1\.0 秒/)
    assert.match(result.stdout, /Tokens.*1000\/250.*1000\/250/)
    assert.match(result.stdout, /费用.*0\.42.*0\.42/)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('compare only uses a non-primary Evaluation when explicitly selected', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-compare-iteration-'))
  const databasePath = join(temporaryRoot, 'benchmark.sqlite3')

  try {
    seedDatabase(databasePath)
    const selected = runCli([
      'compare',
      RUN_A,
      RUN_B,
      '--evaluation-a',
      EVALUATION_A_LATEST,
      '--db',
      databasePath,
      '--json',
    ])
    assert.equal(selected.status, 0, selected.stderr)
    const comparison = JSON.parse(selected.stdout) as {
      comparability: { warnings: Array<{ code: string }> }
      runA: { evaluationId: string; score: number; isPrimary: boolean; iterated: boolean }
    }
    assert.equal(comparison.runA.evaluationId, EVALUATION_A_LATEST)
    assert.equal(comparison.runA.score, 91.5)
    assert.equal(comparison.runA.isPrimary, false)
    assert.equal(comparison.runA.iterated, true)
    assert.ok(comparison.comparability.warnings.some(warning =>
      warning.code === 'ITERATED_EVALUATION'))

    const crossRun = runCli([
      'compare',
      RUN_A,
      RUN_B,
      '--evaluation-a',
      EVALUATION_B_PRIMARY,
      '--db',
      databasePath,
      '--json',
    ])
    assert.equal(crossRun.status, 2)
    assert.match(crossRun.stderr, /does not belong to Run/)
    assert.equal(crossRun.stdout, '')
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('result human output exposes full IDs and distinguishes post-exposure iterations', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-result-labels-'))
  const databasePath = join(temporaryRoot, 'benchmark.sqlite3')

  try {
    seedDatabase(databasePath)
    const result = runCli(['result', RUN_A, '--db', databasePath])

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, new RegExp(`PRIMARY\\s+${EVALUATION_A_PRIMARY}\\s+84\\.2/100`))
    assert.match(
      result.stdout,
      new RegExp(`LATEST\\s+POST-EXPOSURE\\s+${EVALUATION_A_LATEST}\\s+91\\.5/100`),
    )
    assert.match(result.stdout, new RegExp(`ITERATION\\s+${EVALUATION_A_ITERATION}\\s+87/100`))
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
