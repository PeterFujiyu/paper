import assert from 'node:assert/strict'
import { test } from 'vitest'

// @ts-expect-error The benchmark CLI is intentionally implemented as native ESM JavaScript.
import { buildResultComparison, buildResultDetail } from '../../agent-benchmark/src/results.mjs'

const RUN_A = '11111111-1111-4111-8111-111111111111'
const RUN_B = '22222222-2222-4222-8222-222222222222'
const EVALUATION_A_PRIMARY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EVALUATION_A_LATEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const EVALUATION_B_PRIMARY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const EVALUATION_RUNNING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

interface RunRecord extends Record<string, unknown> {
  id: string
  primaryEvaluationId: string | null
  latestEvaluationId: string | null
}

interface EvaluationRecord extends Record<string, unknown> {
  id: string
  runId: string
  status: string
}

class FakeRepository {
  readonly runs: RunRecord[]
  readonly evaluations: EvaluationRecord[]

  constructor(runs: RunRecord[], evaluations: EvaluationRecord[]) {
    this.runs = runs
    this.evaluations = evaluations
  }

  getRun(reference: string): RunRecord {
    const normalized = reference.toLowerCase().replaceAll('-', '')
    const matches = this.runs.filter(run => (
      run.id.toLowerCase().replaceAll('-', '').startsWith(normalized)
    ))
    if (matches.length !== 1) throw new Error(`Run not found or ambiguous: ${reference}`)
    return matches[0]
  }

  getEvaluation(id: string): EvaluationRecord | null {
    return this.evaluations.find(evaluation => evaluation.id === id) ?? null
  }

  listEvaluations(runId: string): EvaluationRecord[] {
    return this.evaluations.filter(evaluation => evaluation.runId === runId)
  }
}

function makeRun(
  id: string,
  primaryEvaluationId: string | null,
  overrides: Record<string, unknown> = {},
): RunRecord {
  return {
    id,
    displayId: id.slice(0, 8),
    caseId: 'auth-session-hardening',
    title: '强化会话校验与注册安全',
    status: primaryEvaluationId === null ? 'ready_for_evaluation' : 'completed',
    benchmarkManifestHash: 'a'.repeat(64),
    promptVersion: '1.0',
    promptProvenance: 'canonical_v2',
    promptHash: 'b'.repeat(64),
    promptText: 'NEVER EXPOSE THIS PROMPT',
    adapterId: 'codex',
    adapterDisplayName: 'Codex CLI',
    executablePath: '/secret/bin/codex',
    executableRealpath: '/secret/real/codex',
    versionRaw: 'codex-cli 0.144.5',
    versionNormalized: '0.144.5',
    requestedModel: 'gpt-5',
    effectiveModel: 'gpt-5-2026-07-01',
    requestedEffort: 'high',
    adapterEffortValue: 'high',
    effectiveEffort: 'high',
    runMode: 'managed',
    dependencyStrategy: 'isolated',
    permissionPolicy: 'workspace-write',
    writeIsolation: 'enforced',
    secretIsolation: 'cli_filtered',
    toolNetworkIsolation: 'enforced',
    executionConfigVerified: true,
    executionConfigSource: 'managed_launch',
    exposureState: 'blind',
    exposureTypes: [],
    inputTokens: 120,
    outputTokens: 45,
    cachedTokens: 20,
    reasoningTokens: 12,
    cost: 0.42,
    agentDurationMs: 15_000,
    workspace: `/secret/workspaces/${id}`,
    primaryEvaluationId,
    latestEvaluationId: primaryEvaluationId,
    ...overrides,
  }
}

function makeEvaluation(
  id: string,
  runId: string,
  score: number,
  overrides: Record<string, unknown> = {},
): EvaluationRecord {
  return {
    id,
    runId,
    status: 'completed',
    isPrimary: true,
    postExposure: false,
    score,
    maxScore: 100,
    changedFileF1: 0.75,
    durationMs: 5_000,
    checks: [
      {
        evaluationId: id,
        id: 'behavior',
        label: '行为检查',
        kind: 'vitest',
        order: 0,
        points: 70,
        passed: true,
        exitCode: 0,
        signal: null,
        durationMs: 2_000,
        detailsHidden: false,
        diagnosticReference: '/secret/oracle/output.txt',
      },
    ],
    report: {
      workspace: '/secret/evaluation/workspace',
      reportFile: '/secret/report.json',
      oracleCommand: 'NEVER EXPOSE THIS ORACLE COMMAND',
    },
    artifactPath: '/secret/report.json',
    safeErrorSummary: 'NEVER EXPOSE THIS DIAGNOSTIC',
    ...overrides,
  }
}

function makeRepository(): FakeRepository {
  const runA = makeRun(RUN_A, EVALUATION_A_PRIMARY, {
    latestEvaluationId: EVALUATION_A_LATEST,
  })
  const runB = makeRun(RUN_B, EVALUATION_B_PRIMARY)
  return new FakeRepository(
    [runA, runB],
    [
      makeEvaluation(EVALUATION_A_PRIMARY, RUN_A, 40),
      makeEvaluation(EVALUATION_A_LATEST, RUN_A, 99, { isPrimary: false }),
      makeEvaluation(EVALUATION_RUNNING, RUN_A, 0, {
        status: 'running',
        isPrimary: false,
      }),
      makeEvaluation(EVALUATION_B_PRIMARY, RUN_B, 80),
    ],
  )
}

test('comparison defaults strictly to each Run primary and returns only safe fields', () => {
  const comparison = buildResultComparison(makeRepository(), '11111111', RUN_B)

  assert.equal(comparison.schemaVersion, 2)
  assert.equal(comparison.type, 'comparison')
  assert.equal(comparison.runA.evaluationId, EVALUATION_A_PRIMARY)
  assert.equal(comparison.runA.score, 40)
  assert.equal(comparison.runA.isPrimary, true)
  assert.equal(comparison.runA.iterated, false)
  assert.equal(comparison.runB.evaluationId, EVALUATION_B_PRIMARY)
  assert.deepEqual(comparison.comparability, { level: 'fair', warnings: [] })
  assert.equal('winner' in comparison, false)

  assert.deepEqual(comparison.runA.checks, [
    {
      id: 'behavior',
      label: '行为检查',
      kind: 'vitest',
      order: 0,
      points: 70,
      passed: true,
      exitCode: 0,
      signal: null,
      durationMs: 2_000,
    },
  ])
  const json = JSON.stringify(comparison)
  for (const secret of [
    'NEVER EXPOSE THIS PROMPT',
    '/secret/workspaces',
    '/secret/evaluation/workspace',
    '/secret/oracle/output.txt',
    'NEVER EXPOSE THIS ORACLE COMMAND',
    'NEVER EXPOSE THIS DIAGNOSTIC',
    '/secret/report.json',
  ]) {
    assert.equal(json.includes(secret), false, `leaked ${secret}`)
  }
})

test('comparison uses an explicitly selected completed iteration and labels it as iterated', () => {
  const comparison = buildResultComparison(makeRepository(), RUN_A, RUN_B, {
    evaluationA: EVALUATION_A_LATEST,
  })

  assert.equal(comparison.runA.evaluationId, EVALUATION_A_LATEST)
  assert.equal(comparison.runA.score, 99)
  assert.equal(comparison.runA.isPrimary, false)
  assert.equal(comparison.runA.iterated, true)
  assert.equal(comparison.comparability.level, 'caution')
  assert.deepEqual(comparison.comparability.warnings, [
    {
      code: 'ITERATED_EVALUATION',
      message: '至少一侧显式选择了迭代评价；这不是双方首轮 primary 的公平对比。',
    },
  ])
})

test('comparison is cautious when effective model or effort telemetry is unknown', () => {
  const repository = makeRepository()
  for (const runId of [RUN_A, RUN_B]) {
    Object.assign(repository.getRun(runId), {
      effectiveModel: null,
      adapterEffortValue: null,
      effectiveEffort: null,
    })
  }

  const comparison = buildResultComparison(repository, RUN_A, RUN_B)

  assert.equal(comparison.comparability.level, 'caution')
  assert.deepEqual(
    comparison.comparability.warnings.map((warning: { code: string }) => warning.code),
    ['MODEL_UNKNOWN', 'EFFORT_UNKNOWN'],
  )
})

test('comparison rejects selecting the same Run on both sides', () => {
  assert.throws(
    () => buildResultComparison(makeRepository(), RUN_A, '11111111'),
    /Cannot compare Run .* with itself/,
  )
})

test('comparison requires a full UUID for an explicit Evaluation selection', () => {
  assert.throws(
    () => buildResultComparison(makeRepository(), RUN_A, RUN_B, {
      evaluationA: EVALUATION_A_LATEST.slice(0, 8),
    }),
    /Evaluation A ID must be a full UUID/,
  )
})

test('comparison rejects an Evaluation owned by the other Run', () => {
  assert.throws(
    () => buildResultComparison(makeRepository(), RUN_A, RUN_B, {
      evaluationA: EVALUATION_B_PRIMARY,
    }),
    /Evaluation .* does not belong to Run .*/,
  )
})

test('comparison rejects an unfinished explicit Evaluation', () => {
  assert.throws(
    () => buildResultComparison(makeRepository(), RUN_A, RUN_B, {
      evaluationA: EVALUATION_RUNNING,
    }),
    /Evaluation .* is running; expected completed/,
  )
})

test('comparison rejects a Run without a primary Evaluation', () => {
  const repository = makeRepository()
  repository.getRun(RUN_A).primaryEvaluationId = null

  assert.throws(
    () => buildResultComparison(repository, RUN_A, RUN_B),
    /Run .* has no primary evaluation/,
  )
})

test('comparison rejects a full Evaluation UUID that does not exist', () => {
  assert.throws(
    () => buildResultComparison(makeRepository(), RUN_A, RUN_B, {
      evaluationA: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    }),
    /Evaluation not found: ffffffff-ffff-4fff-8fff-ffffffffffff/,
  )
})

test('comparison marks an explicitly selected post-exposure iteration incomparable', () => {
  const repository = makeRepository()
  const postExposure = repository.getEvaluation(EVALUATION_A_LATEST)
  assert.ok(postExposure)
  postExposure.postExposure = true

  const comparison = buildResultComparison(repository, RUN_A, RUN_B, {
    evaluationA: EVALUATION_A_LATEST,
  })

  assert.equal(comparison.runA.postExposure, true)
  assert.equal(comparison.comparability.level, 'incomparable')
  assert.deepEqual(
    comparison.comparability.warnings.map((warning: { code: string }) => warning.code),
    ['POST_EXPOSURE', 'ITERATED_EVALUATION'],
  )
})

test('comparison reports every task, Prompt, and manifest incompatibility', () => {
  const repository = makeRepository()
  const runB = repository.getRun(RUN_B)
  runB.caseId = 'different-case'
  runB.promptProvenance = 'user_supplied'
  runB.promptVersion = '2.0'
  runB.promptHash = 'c'.repeat(64)
  runB.benchmarkManifestHash = 'd'.repeat(64)

  const comparison = buildResultComparison(repository, RUN_A, RUN_B)

  assert.equal(comparison.comparability.level, 'incomparable')
  assert.deepEqual(
    comparison.comparability.warnings.map((warning: { code: string }) => warning.code),
    [
      'CASE_MISMATCH',
      'PROMPT_PROVENANCE_MISMATCH',
      'PROMPT_VERSION_MISMATCH',
      'PROMPT_HASH_MISMATCH',
      'MANIFEST_MISMATCH',
    ],
  )
})

test('comparison keeps ad-hoc null metadata safe and reports unknown provenance', () => {
  const repository = makeRepository()
  for (const runId of [RUN_A, RUN_B]) {
    Object.assign(repository.getRun(runId), {
      promptProvenance: 'legacy_unverified',
      promptVersion: null,
      promptHash: null,
      benchmarkManifestHash: null,
      adapterId: null,
      adapterDisplayName: null,
      versionRaw: null,
      versionNormalized: null,
      requestedModel: null,
      effectiveModel: null,
      requestedEffort: null,
      adapterEffortValue: null,
      effectiveEffort: null,
      runMode: 'ad-hoc',
      executionConfigVerified: false,
      executionConfigSource: 'unknown',
      permissionPolicy: null,
      writeIsolation: null,
      secretIsolation: null,
      toolNetworkIsolation: null,
    })
  }

  const comparison = buildResultComparison(repository, RUN_A, RUN_B)

  assert.equal(comparison.runA.adapterId, null)
  assert.equal(comparison.runA.requestedModel, null)
  assert.equal(comparison.runA.requestedEffort, null)
  assert.equal(comparison.runA.versionNormalized, null)
  assert.equal(comparison.comparability.level, 'incomparable')
  const codes = new Set(comparison.comparability.warnings.map(
    (warning: { code: string }) => warning.code,
  ))
  for (const code of [
    'PROMPT_PROVENANCE_UNKNOWN',
    'PROMPT_VERSION_UNKNOWN',
    'PROMPT_HASH_UNKNOWN',
    'MANIFEST_UNKNOWN',
  ]) {
    assert.equal(codes.has(code), true, `missing warning ${code}`)
  }
})

test('comparison warns for every execution, strategy, exposure, and cross-adapter effort difference', () => {
  const repository = makeRepository()
  Object.assign(repository.getRun(RUN_B), {
    adapterId: 'claude',
    adapterDisplayName: 'Claude Code',
    versionRaw: '2.1.215 (Claude Code)',
    versionNormalized: '2.1.215',
    requestedModel: 'claude-opus-4-1',
    effectiveModel: 'claude-opus-4-1-20260701',
    runMode: 'handoff',
    dependencyStrategy: 'linked',
    permissionPolicy: 'handoff_user_controlled',
    writeIsolation: 'unverified',
    secretIsolation: 'unverified',
    toolNetworkIsolation: 'unrestricted',
    executionConfigVerified: false,
    executionConfigSource: 'planned',
    exposureState: 'oracle_exposed',
    exposureTypes: ['check_output'],
  })

  const comparison = buildResultComparison(repository, RUN_A, RUN_B)

  assert.equal(comparison.comparability.level, 'caution')
  const codes = new Set(comparison.comparability.warnings.map(
    (warning: { code: string }) => warning.code,
  ))
  for (const code of [
    'ADAPTER_MISMATCH',
    'CLI_VERSION_MISMATCH',
    'MODEL_MISMATCH',
    'CROSS_ADAPTER_EFFORT_SEMANTICS',
    'RUN_MODE_MISMATCH',
    'DEPENDENCY_STRATEGY_MISMATCH',
    'PERMISSION_POLICY_MISMATCH',
    'WRITE_ISOLATION_MISMATCH',
    'SECRET_ISOLATION_MISMATCH',
    'TOOL_NETWORK_ISOLATION_MISMATCH',
    'EXECUTION_UNVERIFIED',
    'EXECUTION_VERIFICATION_MISMATCH',
    'EXECUTION_CONFIG_SOURCE_MISMATCH',
    'EXPOSURE_MISMATCH',
  ]) {
    assert.equal(codes.has(code), true, `missing warning ${code}`)
  }
})

test('comparison never calls two matching handoff plans verified execution', () => {
  const repository = makeRepository()
  for (const runId of [RUN_A, RUN_B]) {
    Object.assign(repository.getRun(runId), {
      runMode: 'handoff',
      executionConfigVerified: false,
      executionConfigSource: 'planned',
    })
  }

  const comparison = buildResultComparison(repository, RUN_A, RUN_B)

  assert.deepEqual(comparison.comparability, {
    level: 'caution',
    warnings: [{
      code: 'EXECUTION_UNVERIFIED',
      message: '至少一侧实际执行配置未验证。',
    }],
  })
})

test('result detail labels primary, latest, and intermediate evaluations accurately', () => {
  const detail = buildResultDetail(makeRepository(), '11111111')

  assert.equal(detail.schemaVersion, 2)
  assert.equal(detail.type, 'result')
  assert.equal(detail.run.runId, RUN_A)
  assert.equal(detail.run.primaryEvaluationId, EVALUATION_A_PRIMARY)
  assert.equal(detail.run.latestEvaluationId, EVALUATION_A_LATEST)
  assert.deepEqual(
    Object.fromEntries(detail.evaluations.map(
      (evaluation: { evaluationId: string; label: string }) => [
        evaluation.evaluationId,
        evaluation.label,
      ],
    )),
    {
      [EVALUATION_A_PRIMARY]: 'PRIMARY',
      [EVALUATION_A_LATEST]: 'LATEST',
      [EVALUATION_RUNNING]: 'ITERATION',
    },
  )
  assert.equal(JSON.stringify(detail).includes('/secret/workspaces'), false)
  assert.equal(JSON.stringify(detail).includes('NEVER EXPOSE THIS PROMPT'), false)
})
