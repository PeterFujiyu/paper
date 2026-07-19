import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test } from 'vitest'

// @ts-expect-error The benchmark CLI is intentionally implemented as native ESM JavaScript.
import { BenchmarkRepository, defaultDatabasePath } from '../../agent-benchmark/src/repository.mjs'

const RUN_A = '11111111-1111-4111-8111-111111111111'
const RUN_B = '22222222-2222-4222-8222-222222222222'
const RUN_C = '33333333-3333-4333-8333-333333333333'
const RUN_D = '44444444-4444-4444-8444-444444444444'
const EVALUATION_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const EVALUATION_B = 'bbbbbbbb-1111-4111-8111-111111111111'
const EVALUATION_C = 'cccccccc-1111-4111-8111-111111111111'

function makeRun(
  id: string,
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
    promptText: 'DO-NOT-LEAK-PROMPT',
    promptHash: 'c'.repeat(64),
    adapterId: 'codex',
    adapterDisplayName: 'Codex CLI',
    executablePath: '/usr/local/bin/codex',
    executableRealpath: '/opt/codex/bin/codex',
    versionRaw: 'codex-cli 0.144.5',
    versionNormalized: '0.144.5',
    capabilities: { efforts: ['high'] },
    requestedModel: 'gpt-5',
    requestedEffort: 'high',
    adapterEffortValue: 'high',
    runMode: 'handoff',
    executionConfigVerified: true,
    executionConfigSource: 'agent_output',
    dependencyStrategy: 'isolated',
    workspace: '/tmp/DO-NOT-LEAK-WORKSPACE',
    status: 'ready_for_evaluation',
    agentDurationMs: 45_000,
    inputTokens: 1_000,
    outputTokens: 250,
    cachedTokens: 400,
    reasoningTokens: 75,
    cost: 0.42,
    createdAt: '2026-07-18T10:00:00.000Z',
    updatedAt: '2026-07-18T10:00:00.000Z',
    ...overrides,
  }
}

function makeReport(score: number): Record<string, unknown> {
  return {
    schemaVersion: 1,
    caseId: 'auth-session-hardening',
    title: '强化会话校验与注册安全',
    workspace: '/tmp/DO-NOT-LEAK-EVALUATION-WORKSPACE',
    startedAt: '2026-07-19T01:00:00.000Z',
    durationMs: 12_345,
    score,
    maxScore: 100,
    checks: [
      {
        id: 'behavior',
        label: '行为测试',
        points: 70,
        passed: true,
        durationMs: 5_600,
        detailsHidden: true,
        diagnosticReference: '/tmp/DO-NOT-LEAK-DIAGNOSTIC',
      },
      {
        id: 'typecheck',
        label: '类型检查',
        points: 15,
        passed: true,
        durationMs: 1_200,
        detailsHidden: true,
      },
      {
        id: 'build',
        label: '生产构建',
        points: 15,
        passed: false,
        durationMs: 2_400,
        detailsHidden: true,
      },
    ],
    scoring: {
      checks: { score: 85, maxScore: 100, weight: 80 },
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
    reportFile: '/tmp/DO-NOT-LEAK-REPORT.json',
  }
}

function withRepository(
  action: (repository: InstanceType<typeof BenchmarkRepository>) => void,
): void {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-history-'))
  const repository = new BenchmarkRepository(defaultDatabasePath(temporaryRoot))
  try {
    action(repository)
  } finally {
    repository.close()
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

function completeEvaluation(
  repository: InstanceType<typeof BenchmarkRepository>,
  runId: string,
  evaluationId: string,
  score: number,
  startedAt: string,
  finishedAt: string,
): void {
  repository.beginEvaluation(runId, evaluationId, startedAt, `fingerprint-${evaluationId}`)
  repository.completeEvaluation(runId, evaluationId, makeReport(score), finishedAt)
}

test('lists a safe run summary using the immutable primary score and latest activity', () => {
  withRepository(repository => {
    repository.createRun(makeRun(RUN_A))
    completeEvaluation(
      repository,
      RUN_A,
      EVALUATION_A,
      84.2,
      '2026-07-19T01:00:00.000Z',
      '2026-07-19T01:00:12.345Z',
    )
    completeEvaluation(
      repository,
      RUN_A,
      EVALUATION_B,
      91.5,
      '2026-07-19T02:00:00.000Z',
      '2026-07-19T02:00:10.000Z',
    )

    const result = repository.listResultSummaries()

    assert.deepEqual(result, {
      items: [{
        id: RUN_A,
        displayId: '11111111',
        caseId: 'auth-session-hardening',
        title: '强化会话校验与注册安全',
        adapterId: 'codex',
        adapterDisplayName: 'Codex CLI',
        versionNormalized: '0.144.5',
        requestedModel: 'gpt-5',
        requestedEffort: 'high',
        runMode: 'handoff',
        status: 'completed',
        executionConfigVerified: true,
        agentDurationMs: 45_000,
        inputTokens: 1_000,
        outputTokens: 250,
        cachedTokens: 400,
        reasoningTokens: 75,
        cost: 0.42,
        activityAt: '2026-07-19T02:00:10.000Z',
        primaryEvaluation: {
          id: EVALUATION_A,
          score: 84.2,
          maxScore: 100,
          changedFileF1: 0.7272727272727272,
          finishedAt: '2026-07-19T01:00:12.345Z',
          durationMs: 12_345,
          checks: {
            behavior: { id: 'behavior', passed: true, points: 70, durationMs: 5_600 },
            typecheck: { id: 'typecheck', passed: true, points: 15, durationMs: 1_200 },
            build: { id: 'build', passed: false, points: 15, durationMs: 2_400 },
          },
        },
        latestEvaluationId: EVALUATION_B,
        hasLaterEvaluation: true,
        hasNonPrimaryEvaluation: true,
      }],
      total: 1,
      limit: 20,
      offset: 0,
      hasPrevious: false,
      hasNext: false,
    })

    const serialized = JSON.stringify(result)
    assert.doesNotMatch(serialized, /DO-NOT-LEAK/)
    assert.doesNotMatch(serialized, /promptText|workspace|report|diagnostic|oracle/i)
  })
})

test('applies exact run filters and inclusive activity date boundaries', () => {
  withRepository(repository => {
    repository.createRun(makeRun(RUN_A, {
      requestedModel: 'gpt-5',
      updatedAt: '2026-07-18T10:00:00.000Z',
    }))
    completeEvaluation(
      repository,
      RUN_A,
      EVALUATION_A,
      84.2,
      '2026-07-19T00:59:00.000Z',
      '2026-07-19T01:00:00.000Z',
    )
    repository.createRun(makeRun(RUN_B, {
      adapterId: 'claude',
      adapterDisplayName: 'Claude Code',
      requestedModel: 'claude-opus',
      updatedAt: '2026-07-19T02:00:00.000Z',
    }))
    repository.createRun(makeRun(RUN_C, {
      caseId: 'different-case',
      title: '不同题目',
      requestedModel: 'gpt-5-mini',
      updatedAt: '2026-07-20T03:00:00.000Z',
    }))
    completeEvaluation(
      repository,
      RUN_C,
      EVALUATION_C,
      70,
      '2026-07-21T00:59:00.000Z',
      '2026-07-21T01:00:00.000Z',
    )
    repository.createRun(makeRun(RUN_D, {
      adapterId: 'codex-proxy',
      requestedModel: 'gpt-5',
      updatedAt: '2026-07-19T04:00:00.000Z',
    }))

    assert.deepEqual(
      repository.listResultSummaries({ caseId: 'auth-session-hardening' }).items
        .map((item: { id: string }) => item.id),
      [RUN_A, RUN_D, RUN_B],
    )
    assert.deepEqual(
      repository.listResultSummaries({ adapterId: 'codex' }).items
        .map((item: { id: string }) => item.id),
      [RUN_C, RUN_A],
    )
    assert.deepEqual(
      repository.listResultSummaries({ requestedModel: 'gpt-5' }).items
        .map((item: { id: string }) => item.id),
      [RUN_A, RUN_D],
    )

    const bounded = repository.listResultSummaries({
      from: '2026-07-19T01:00:00.000Z',
      to: '2026-07-19T04:00:00.000Z',
    })
    assert.deepEqual(
      bounded.items.map((item: { id: string }) => item.id),
      [RUN_A, RUN_D, RUN_B],
    )
    assert.equal(bounded.total, 3)
  })
})

test('rejects invalid history filters and pagination before querying SQLite', () => {
  withRepository(repository => {
    assert.throws(
      () => repository.listResultSummaries({ limit: 0 }),
      /limit must be an integer between 1 and 100/,
    )
    assert.throws(
      () => repository.listResultSummaries({ limit: 101 }),
      /limit must be an integer between 1 and 100/,
    )
    assert.throws(
      () => repository.listResultSummaries({ limit: 1.5 }),
      /limit must be an integer between 1 and 100/,
    )
    assert.throws(
      () => repository.listResultSummaries({ offset: -1 }),
      /offset must be a non-negative integer/,
    )
    assert.throws(
      () => repository.listResultSummaries({ offset: 1.5 }),
      /offset must be a non-negative integer/,
    )
    assert.throws(
      () => repository.listResultSummaries({ caseId: '' }),
      /caseId must be a non-empty string/,
    )
    assert.throws(
      () => repository.listResultSummaries({ from: 'not-a-date' }),
      /from must be a valid timestamp/,
    )
    assert.throws(
      () => repository.listResultSummaries({
        from: '2026-07-20T00:00:00.000Z',
        to: '2026-07-19T00:00:00.000Z',
      }),
      /from must not be after to/,
    )
  })
})

test('paginates completed runs before ad-hoc and unevaluated runs with stable ID ties', () => {
  withRepository(repository => {
    repository.createRun(makeRun(RUN_A))
    completeEvaluation(
      repository,
      RUN_A,
      EVALUATION_A,
      84.2,
      '2026-07-19T00:59:00.000Z',
      '2026-07-19T01:00:00.000Z',
    )
    repository.createRun(makeRun(RUN_C))
    completeEvaluation(
      repository,
      RUN_C,
      EVALUATION_C,
      70,
      '2026-07-19T00:59:30.000Z',
      '2026-07-19T01:00:00.000Z',
    )
    repository.transitionRun(RUN_C, ['completed'], 'cancelled', {
      updatedAt: '2026-07-22T00:00:00.000Z',
    })
    repository.createRun(makeRun(RUN_B, {
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
      executionConfigVerified: false,
      executionConfigSource: 'unknown',
      status: 'ready_for_evaluation',
      updatedAt: '2026-07-20T00:00:00.000Z',
    }))
    repository.createRun(makeRun(RUN_D, {
      status: 'preparing',
      updatedAt: '2026-07-20T00:00:00.000Z',
    }))

    const page = repository.listResultSummaries({ limit: 2, offset: 1 })

    assert.deepEqual(
      page.items.map((item: { id: string }) => item.id),
      [RUN_C, RUN_B],
    )
    assert.deepEqual(
      {
        total: page.total,
        limit: page.limit,
        offset: page.offset,
        hasPrevious: page.hasPrevious,
        hasNext: page.hasNext,
      },
      { total: 4, limit: 2, offset: 1, hasPrevious: true, hasNext: true },
    )
    assert.deepEqual(page.items[1], {
      id: RUN_B,
      displayId: '22222222',
      caseId: 'auth-session-hardening',
      title: '强化会话校验与注册安全',
      adapterId: null,
      adapterDisplayName: null,
      versionNormalized: null,
      requestedModel: null,
      requestedEffort: null,
      runMode: 'ad-hoc',
      status: 'ready_for_evaluation',
      executionConfigVerified: false,
      agentDurationMs: 45_000,
      inputTokens: 1_000,
      outputTokens: 250,
      cachedTokens: 400,
      reasoningTokens: 75,
      cost: 0.42,
      activityAt: '2026-07-20T00:00:00.000Z',
      primaryEvaluation: null,
      latestEvaluationId: null,
      hasLaterEvaluation: false,
      hasNonPrimaryEvaluation: false,
    })
  })
})
