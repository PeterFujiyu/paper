import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'

// @ts-expect-error The benchmark CLI is intentionally implemented as native ESM JavaScript.
import { BenchmarkRepository, defaultDatabasePath } from '../../agent-benchmark/src/repository.mjs'

interface SqliteDatabase {
  close(): void
  prepare(source: string): {
    all(...parameters: unknown[]): unknown[]
  }
}

interface SqliteConstructor {
  new(filename: string): SqliteDatabase
}

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as SqliteConstructor

const RUN_ID = '11111111-1111-4111-8111-111111111111'
const EVALUATION_A = '22222222-2222-4222-8222-222222222222'
const EVALUATION_B = '33333333-3333-4333-8333-333333333333'

function makeRun(status = 'ready_for_evaluation'): Record<string, unknown> {
  return {
    id: RUN_ID,
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
    capabilities: { efforts: ['medium', 'high'] },
    requestedModel: 'default',
    requestedEffort: 'high',
    adapterEffortValue: 'high',
    runMode: 'handoff',
    executionConfigVerified: false,
    executionConfigSource: 'planned',
    dependencyStrategy: 'isolated',
    workspace: `/tmp/workspaces/${RUN_ID}`,
    status,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  }
}

function completeFirstEvaluation(repository: InstanceType<typeof BenchmarkRepository>): void {
  repository.beginEvaluation(
    RUN_ID,
    EVALUATION_A,
    '2026-07-19T00:10:00.000Z',
    'candidate-a',
  )
  repository.completeEvaluation(
    RUN_ID,
    EVALUATION_A,
    {
      schemaVersion: 1,
      caseId: 'auth-session-hardening',
      title: '强化会话校验与注册安全',
      score: 100,
      maxScore: 100,
      checks: [],
    },
    '2026-07-19T00:11:00.000Z',
  )
}

test('serializes operation leases across repository connections and verifies ownership', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-lease-conflict-'))
  const databasePath = defaultDatabasePath(temporaryRoot)
  const firstProcess = new BenchmarkRepository(databasePath)
  const secondProcess = new BenchmarkRepository(databasePath)

  try {
    firstProcess.createRun(makeRun())
    const acquired = firstProcess.acquireOperationLease(
      RUN_ID,
      'evaluation',
      EVALUATION_A,
      'owner-token-a',
      101,
      'host-a',
      '2026-07-19T01:00:00.000Z',
      '2026-07-19T01:01:00.000Z',
    )
    assert.equal(acquired.attemptId, EVALUATION_A)
    assert.equal(acquired.heartbeatAt, '2026-07-19T01:00:00.000Z')

    assert.throws(
      () => secondProcess.acquireOperationLease(
        RUN_ID,
        'evaluation',
        EVALUATION_B,
        'owner-token-b',
        202,
        'host-b',
        '2026-07-19T01:00:05.000Z',
        '2026-07-19T01:01:05.000Z',
      ),
      /already has an operation lease.*evaluation.*22222222/i,
    )
    assert.throws(
      () => firstProcess.renewOperationLease(
        RUN_ID,
        EVALUATION_A,
        'wrong-owner',
        '2026-07-19T01:00:30.000Z',
        '2026-07-19T01:01:30.000Z',
      ),
      /does not own the operation lease/i,
    )
    assert.throws(
      () => firstProcess.releaseOperationLease(
        RUN_ID,
        EVALUATION_B,
        'owner-token-a',
      ),
      /does not own the operation lease/i,
    )

    const renewed = firstProcess.heartbeatOperationLease(
      RUN_ID,
      EVALUATION_A,
      'owner-token-a',
      '2026-07-19T01:00:30.000Z',
      '2026-07-19T01:01:30.000Z',
    )
    assert.equal(renewed.heartbeatAt, '2026-07-19T01:00:30.000Z')
    assert.equal(renewed.expiresAt, '2026-07-19T01:01:30.000Z')

    firstProcess.releaseOperationLease(RUN_ID, EVALUATION_A, 'owner-token-a')
    const acquiredBySecond = secondProcess.acquireOperationLease(
      RUN_ID,
      'evaluation',
      EVALUATION_B,
      'owner-token-b',
      202,
      'host-b',
      '2026-07-19T01:00:40.000Z',
      '2026-07-19T01:01:40.000Z',
    )
    assert.equal(acquiredBySecond.ownerToken, 'owner-token-b')
  } finally {
    firstProcess.close()
    secondProcess.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('does not recover an evaluation while its operation lease is still active', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-lease-active-'))
  const repository = new BenchmarkRepository(defaultDatabasePath(temporaryRoot))

  try {
    repository.createRun(makeRun())
    repository.acquireOperationLease(
      RUN_ID,
      'evaluation',
      EVALUATION_A,
      'owner-token-a',
      101,
      'host-a',
      '2026-07-19T01:00:00.000Z',
      '2026-07-19T01:01:00.000Z',
    )
    repository.beginEvaluation(
      RUN_ID,
      EVALUATION_A,
      '2026-07-19T01:00:00.000Z',
      'candidate-a',
    )

    assert.deepEqual(
      repository.recoverExpiredOperation(RUN_ID, '2026-07-19T01:00:59.999Z'),
      {
        recovered: false,
        reason: 'not_expired',
        operationType: 'evaluation',
        attemptId: EVALUATION_A,
        expiresAt: '2026-07-19T01:01:00.000Z',
      },
    )
    assert.equal(repository.getEvaluation(EVALUATION_A).status, 'running')
    assert.equal(repository.getRun(RUN_ID).status, 'evaluating')
    assert.throws(
      () => repository.acquireOperationLease(
        RUN_ID,
        'evaluation',
        EVALUATION_B,
        'owner-token-b',
        202,
        'host-b',
        '2026-07-19T01:00:59.999Z',
        '2026-07-19T01:02:00.000Z',
      ),
      /already has an operation lease/i,
    )
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('recovers an expired first evaluation as interrupted and makes the Run ready again', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-lease-first-'))
  const databasePath = defaultDatabasePath(temporaryRoot)
  const repository = new BenchmarkRepository(databasePath)

  try {
    repository.createRun(makeRun())
    repository.acquireOperationLease(
      RUN_ID,
      'evaluation',
      EVALUATION_A,
      'owner-token-a',
      101,
      'host-a',
      '2026-07-19T01:00:00.000Z',
      '2026-07-19T01:01:00.000Z',
    )
    repository.beginEvaluation(
      RUN_ID,
      EVALUATION_A,
      '2026-07-19T01:00:00.000Z',
      'candidate-a',
    )

    const recovered = repository.recoverExpiredOperation(
      RUN_ID,
      '2026-07-19T01:01:00.000Z',
    )
    assert.deepEqual(recovered, {
      recovered: true,
      operationType: 'evaluation',
      attemptId: EVALUATION_A,
      evaluationInterrupted: true,
      runStatus: 'ready_for_evaluation',
    })

    const interrupted = repository.getEvaluation(EVALUATION_A)
    assert.equal(interrupted.status, 'interrupted')
    assert.equal(interrupted.finishedAt, '2026-07-19T01:01:00.000Z')
    assert.equal(interrupted.durationMs, 60_000)
    assert.equal(repository.getRun(RUN_ID).status, 'ready_for_evaluation')

    const replacement = repository.acquireOperationLease(
      RUN_ID,
      'evaluation',
      EVALUATION_B,
      'owner-token-b',
      202,
      'host-b',
      '2026-07-19T01:01:01.000Z',
      '2026-07-19T01:02:01.000Z',
    )
    assert.equal(replacement.attemptId, EVALUATION_B)
  } finally {
    repository.close()
  }

  const database = new Database(databasePath)
  try {
    const events = database.prepare(`
      SELECT event_type, payload_json
      FROM run_events
      WHERE run_id = ?
      ORDER BY sequence
    `).all(RUN_ID) as Array<{ event_type: string; payload_json: string }>
    assert.equal(events.at(-2)?.event_type, 'evaluation_interrupted')
    assert.match(events.at(-2)?.payload_json ?? '', /22222222-2222-4222-8222-222222222222/)
  } finally {
    database.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('recovers an expired later evaluation without replacing or downgrading the primary Run', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-lease-later-'))
  const repository = new BenchmarkRepository(defaultDatabasePath(temporaryRoot))

  try {
    repository.createRun(makeRun())
    completeFirstEvaluation(repository)
    const completedRun = repository.getRun(RUN_ID)

    repository.acquireOperationLease(
      RUN_ID,
      'evaluation',
      EVALUATION_B,
      'owner-token-b',
      202,
      'host-b',
      '2026-07-19T02:00:00.000Z',
      '2026-07-19T02:01:00.000Z',
    )
    repository.beginEvaluation(
      RUN_ID,
      EVALUATION_B,
      '2026-07-19T02:00:00.000Z',
      'candidate-b',
    )

    const recovered = repository.recoverExpiredOperation(
      RUN_ID,
      '2026-07-19T02:01:00.001Z',
    )
    assert.equal(recovered.recovered, true)
    assert.equal(recovered.runStatus, 'completed')
    assert.equal(repository.getEvaluation(EVALUATION_B).status, 'interrupted')

    const run = repository.getRun(RUN_ID)
    assert.equal(run.status, 'completed')
    assert.equal(run.primaryEvaluationId, completedRun.primaryEvaluationId)
    assert.equal(run.latestEvaluationId, completedRun.latestEvaluationId)
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
