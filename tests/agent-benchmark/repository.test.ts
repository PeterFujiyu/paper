import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'

// @ts-expect-error The benchmark CLI is intentionally implemented as native ESM JavaScript.
import { BenchmarkRepository, defaultDatabasePath } from '../../agent-benchmark/src/repository.mjs'

interface SqliteDatabase {
  close(): void
  exec(source: string): void
  pragma(source: string, options?: { simple?: boolean }): unknown
  prepare(source: string): {
    all(...parameters: unknown[]): unknown[]
    get(...parameters: unknown[]): unknown
    run(...parameters: unknown[]): unknown
  }
}

interface SqliteConstructor {
  new(filename: string): SqliteDatabase
}

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as SqliteConstructor

const RUN_A = '11111111-1111-4111-8111-111111111111'
const EVALUATION_A = '22222222-2222-4222-8222-222222222222'
const EVALUATION_B = '33333333-3333-4333-8333-333333333333'
const EVALUATION_C = '44444444-4444-4444-8444-444444444444'
const EVALUATION_D = '55555555-5555-4555-8555-555555555555'

function makeRun(
  id = RUN_A,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    caseId: 'auth-session-hardening',
    title: '强化会话校验与注册安全',
    baseTree: 'a'.repeat(40),
    benchmarkManifestHash: 'b'.repeat(64),
    promptVersion: '1',
    promptProvenance: 'generated',
    promptText: '完成认证安全任务。',
    promptHash: 'c'.repeat(64),
    adapterId: 'codex',
    adapterDisplayName: 'Codex CLI',
    executablePath: '/usr/local/bin/codex',
    executableRealpath: '/opt/codex/bin/codex',
    versionRaw: 'codex-cli 0.144.5',
    versionNormalized: '0.144.5',
    capabilities: {
      efforts: ['medium', 'high'],
      invocation: { jsonl: true },
    },
    requestedModel: 'default',
    requestedEffort: 'high',
    adapterEffortValue: 'high',
    runMode: 'handoff',
    executionConfigVerified: false,
    executionConfigSource: 'planned',
    dependencyStrategy: 'isolated',
    workspace: `/tmp/workspaces/${id}`,
    status: 'preparing',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  }
}

function makeReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    caseId: 'auth-session-hardening',
    title: '强化会话校验与注册安全',
    workspace: `/tmp/workspaces/${RUN_A}`,
    startedAt: '2026-07-19T01:00:00.000Z',
    durationMs: 12_345,
    score: 84.2,
    maxScore: 100,
    checks: [
      {
        id: 'typecheck',
        label: 'TypeScript 类型检查',
        points: 15,
        passed: true,
        exitCode: 0,
        signal: null,
        durationMs: 1_200,
        detailsHidden: true,
      },
      {
        id: 'behavior',
        label: '认证与撤销回归测试',
        points: 70,
        passed: true,
        exitCode: 0,
        signal: null,
        durationMs: 5_600,
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
        f1: 0.7272727272727272,
        weight: 20,
      },
    },
    oracleFileCount: 4,
    dependencyMode: 'copy',
    evaluationDirectory: null,
    evaluationDirectories: [],
    reportFile: '/tmp/results/report.json',
    ...overrides,
  }
}

test('opens and idempotently migrates a database with safe connection pragmas', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-repository-'))
  const databasePath = defaultDatabasePath(temporaryRoot)

  try {
    assert.equal(databasePath, join(temporaryRoot, '.agent-benchmark', 'benchmark.sqlite3'))

    new BenchmarkRepository(databasePath).close()
    new BenchmarkRepository(databasePath).close()

    if (process.platform !== 'win32') {
      assert.equal(statSync(databasePath).mode & 0o777, 0o600)
      assert.equal(statSync(join(temporaryRoot, '.agent-benchmark')).mode & 0o777, 0o700)
    }

    const database = new Database(databasePath)
    try {
      const tables = database.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name
      `).all() as Array<{ name: string }>
      assert.deepEqual(
        tables.map(table => table.name).filter(name => !name.startsWith('sqlite_')),
        [
          'agent_launches',
          'benchmark_runs',
          'evaluation_checks',
          'evaluations',
          'operation_leases',
          'run_events',
          'schema_migrations',
        ],
      )
      assert.equal(database.pragma('foreign_keys', { simple: true }), 1)
      assert.equal(database.pragma('journal_mode', { simple: true }), 'wal')
      assert.equal(database.pragma('busy_timeout', { simple: true }), 5000)
      assert.deepEqual(
        database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get(),
        { count: 1 },
      )
    } finally {
      database.close()
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('creates normalized runs, resolves unique UUID prefixes, and lists records', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-repository-runs-'))
  const repository = new BenchmarkRepository(defaultDatabasePath(temporaryRoot))

  try {
    const created = repository.createRun(makeRun())

    assert.equal(created.id, RUN_A)
    assert.equal(created.displayId, '11111111')
    assert.equal(created.title, '强化会话校验与注册安全')
    assert.equal(created.executionConfigVerified, false)
    assert.deepEqual(created.capabilities, {
      efforts: ['medium', 'high'],
      invocation: { jsonl: true },
    })
    assert.deepEqual(repository.getRun(RUN_A), created)
    assert.deepEqual(repository.getRun('11111111'), created)
    assert.deepEqual(repository.listRuns(), [created])
    assert.deepEqual(repository.listIncompleteRuns(), [created])
    assert.throws(
      () => repository.getRun('1111111'),
      /at least 8 hexadecimal characters/,
    )
    assert.throws(
      () => repository.getRun('deadbeef'),
      /Run not found: deadbeef/,
    )

    repository.createRun(makeRun('aaaaaaaa-1111-4111-8111-111111111111'))
    repository.createRun(makeRun('aaaaaaaa-2222-4222-8222-222222222222'))
    assert.throws(
      () => repository.getRun('aaaaaaaa'),
      /Run ID prefix is ambiguous: aaaaaaaa/,
    )
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('compares and swaps run status transitions', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-repository-cas-'))
  const repository = new BenchmarkRepository(defaultDatabasePath(temporaryRoot))

  try {
    repository.createRun(makeRun())

    const prepared = repository.transitionRun(RUN_A, ['preparing'], 'prepared', {
      updatedAt: '2026-07-19T00:01:00.000Z',
    })
    assert.equal(prepared.status, 'prepared')
    assert.equal(prepared.updatedAt, '2026-07-19T00:01:00.000Z')
    assert.throws(
      () => repository.transitionRun(RUN_A, ['preparing'], 'prepared'),
      /status prepared; expected one of preparing/,
    )

    assert.equal(repository.markRunReady(RUN_A).status, 'ready_for_evaluation')
    assert.equal(repository.listIncompleteRuns().length, 1)
    repository.transitionRun(RUN_A, ['ready_for_evaluation'], 'cancelled')
    assert.deepEqual(repository.listIncompleteRuns(), [])
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('preserves explicit legacy-unverified null provenance for ad-hoc evaluations', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-repository-legacy-'))
  const repository = new BenchmarkRepository(defaultDatabasePath(temporaryRoot))

  try {
    const legacy = repository.createRun(makeRun(RUN_A, {
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
      requestedModel: null,
      requestedEffort: null,
      adapterEffortValue: null,
      runMode: 'ad-hoc',
      executionConfigSource: 'unknown',
    }))

    assert.equal(legacy.promptProvenance, 'legacy_unverified')
    assert.equal(legacy.promptText, null)
    assert.equal(legacy.promptHash, null)
    assert.equal(legacy.adapterId, null)
    assert.equal(legacy.requestedModel, null)
    assert.equal(legacy.requestedEffort, null)
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('persists complete evaluations transactionally and never replaces the primary result', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-repository-evaluations-'))
  const repository = new BenchmarkRepository(defaultDatabasePath(temporaryRoot))

  try {
    repository.createRun(makeRun(RUN_A, { status: 'ready_for_evaluation' }))
    repository.beginEvaluation(
      RUN_A,
      EVALUATION_A,
      '2026-07-19T01:00:00.000Z',
      'candidate-fingerprint-a',
    )
    assert.equal(repository.getRun(RUN_A).status, 'evaluating')
    assert.equal(repository.getEvaluation(EVALUATION_A).status, 'running')

    const reportA = makeReport({
      candidateFingerprint: 'candidate-fingerprint-frozen',
    })
    const first = repository.completeEvaluation(
      RUN_A,
      EVALUATION_A,
      reportA,
      '2026-07-19T01:00:12.345Z',
    )
    assert.equal(first.status, 'completed')
    assert.equal(first.isPrimary, true)
    assert.equal(first.postExposure, false)
    assert.equal(first.candidateFingerprint, 'candidate-fingerprint-frozen')
    assert.equal(first.changedFileF1, 0.7272727272727272)
    assert.deepEqual(first.report, reportA)
    assert.deepEqual(
      first.checks.map((check: { id: string; passed: boolean }) => ({
        id: check.id,
        passed: check.passed,
      })),
      [
        { id: 'typecheck', passed: true },
        { id: 'behavior', passed: true },
      ],
    )

    const runAfterFirst = repository.getRun(RUN_A)
    assert.equal(runAfterFirst.status, 'completed')
    assert.equal(runAfterFirst.primaryEvaluationId, EVALUATION_A)
    assert.equal(runAfterFirst.latestEvaluationId, EVALUATION_A)

    assert.deepEqual(
      repository.completeEvaluation(
        RUN_A,
        EVALUATION_A,
        { ...reportA },
        '2026-07-19T01:00:15.000Z',
      ),
      first,
    )
    assert.throws(
      () => repository.completeEvaluation(
        RUN_A,
        EVALUATION_A,
        { ...reportA, score: 99 },
        '2026-07-19T01:00:15.000Z',
      ),
      /already completed with a different report/,
    )

    repository.beginEvaluation(
      RUN_A,
      EVALUATION_B,
      '2026-07-19T02:00:00.000Z',
      'candidate-fingerprint-b',
    )
    assert.equal(repository.getRun(RUN_A).status, 'completed')
    const second = repository.completeEvaluation(
      RUN_A,
      EVALUATION_B,
      makeReport({ score: 91.5 }),
      '2026-07-19T02:00:10.000Z',
    )
    assert.equal(second.isPrimary, false)

    repository.beginEvaluation(
      RUN_A,
      EVALUATION_C,
      '2026-07-19T03:00:00.000Z',
      'candidate-fingerprint-c',
    )
    const postExposure = repository.completeEvaluation(
      RUN_A,
      EVALUATION_C,
      makeReport({ score: 100 }),
      '2026-07-19T03:00:10.000Z',
      true,
    )
    assert.equal(postExposure.postExposure, true)
    assert.equal(postExposure.isPrimary, false)

    const finalRun = repository.getRun(RUN_A)
    assert.equal(finalRun.primaryEvaluationId, EVALUATION_A)
    assert.equal(finalRun.latestEvaluationId, EVALUATION_C)
    assert.deepEqual(
      repository.listEvaluations(RUN_A).map((evaluation: { id: string }) => evaluation.id),
      [EVALUATION_C, EVALUATION_B, EVALUATION_A],
    )
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('records evaluation infrastructure failures without obscuring a primary result', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-repository-failure-'))
  const repository = new BenchmarkRepository(defaultDatabasePath(temporaryRoot))

  try {
    repository.createRun(makeRun(RUN_A, { status: 'ready_for_evaluation' }))
    repository.beginEvaluation(
      RUN_A,
      EVALUATION_D,
      '2026-07-19T01:00:00.000Z',
      'candidate-fingerprint-d',
    )
    const failed = repository.failEvaluation(
      RUN_A,
      EVALUATION_D,
      new Error('temporary evaluation directory failed'),
      '2026-07-19T01:00:01.000Z',
    )

    assert.equal(failed.status, 'failed')
    assert.equal(failed.safeErrorSummary, 'temporary evaluation directory failed')
    assert.equal(repository.getRun(RUN_A).status, 'evaluation_failed')
    assert.equal(repository.markRunReady(RUN_A).status, 'ready_for_evaluation')
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('atomically records oracle exposure without disqualifying the just-finished blind snapshot', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-repository-exposure-'))
  const repository = new BenchmarkRepository(defaultDatabasePath(temporaryRoot))

  try {
    repository.createRun(makeRun(RUN_A, { status: 'ready_for_evaluation' }))
    repository.beginEvaluation(
      RUN_A,
      EVALUATION_A,
      '2026-07-19T01:00:00.000Z',
      'candidate-fingerprint-a',
    )
    const revealed = repository.completeEvaluation(
      RUN_A,
      EVALUATION_A,
      makeReport({
        checks: [{
          id: 'behavior',
          label: '认证与撤销回归测试',
          points: 100,
          passed: false,
          output: 'hidden assertion details',
        }],
      }),
      '2026-07-19T01:00:10.000Z',
      false,
      ['check_output'],
    )

    assert.equal(revealed.isPrimary, true)
    assert.equal(revealed.postExposure, false)
    const exposedRun = repository.getRun(RUN_A)
    assert.equal(exposedRun.exposureState, 'oracle_exposed')
    assert.equal(exposedRun.oracleExposedAt, '2026-07-19T01:00:10.000Z')
    assert.deepEqual(exposedRun.exposureTypes, ['check_output'])

    repository.beginEvaluation(
      RUN_A,
      EVALUATION_B,
      '2026-07-19T02:00:00.000Z',
      'candidate-fingerprint-b',
    )
    const later = repository.completeEvaluation(
      RUN_A,
      EVALUATION_B,
      makeReport({ score: 99 }),
      '2026-07-19T02:00:10.000Z',
    )
    assert.equal(later.isPrimary, false)
    assert.equal(later.postExposure, true)
    assert.equal(repository.getRun(RUN_A).primaryEvaluationId, EVALUATION_A)
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('rejects a database migrated by an unknown future runner', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-repository-future-'))
  const databasePath = join(temporaryRoot, 'future.sqlite3')
  const database = new Database(databasePath)

  try {
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL,
        runner_version TEXT NOT NULL
      )
    `)
    database.prepare(`
      INSERT INTO schema_migrations (version, applied_at, runner_version)
      VALUES (?, ?, ?)
    `).run(2, '2026-07-19T00:00:00.000Z', 'future')
  } finally {
    database.close()
  }

  try {
    assert.throws(
      () => new BenchmarkRepository(databasePath),
      /schema version 2 is newer than supported version 1/,
    )
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
