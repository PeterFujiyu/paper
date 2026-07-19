import assert from 'node:assert/strict'
import { basename, join, resolve } from 'node:path'

import { test } from 'vitest'

// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import { loadManifest } from '../../agent-benchmark/src/catalog.mjs'
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
    versionNormalized: '0.144.5',
  },
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    found: true,
    executable: '/tmp/fake-claude',
    versionNormalized: '2.1.215',
  },
}

const RUN_A = '11111111-1111-4111-8111-111111111111'
const RUN_B = '22222222-2222-4222-8222-222222222222'
const RUN_C = '33333333-3333-4333-8333-333333333333'

function makeSummary(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    displayId: id.slice(0, 8),
    caseId: 'auth-session-hardening',
    title: '强化会话校验与注册安全',
    adapterId: 'codex',
    adapterDisplayName: 'Codex CLI',
    versionNormalized: '0.144.5',
    requestedModel: 'gpt-5',
    requestedEffort: 'high',
    runMode: 'handoff',
    status: 'completed',
    executionConfigVerified: false,
    agentDurationMs: 45_000,
    activityAt: '2026-07-19T02:00:10.000Z',
    primaryEvaluation: {
      id: 'aaaaaaaa-1111-4111-8111-111111111111',
      score: 84.2,
      maxScore: 100,
      changedFileF1: 0.727,
      durationMs: 12_345,
      checks: {
        behavior: { passed: true, points: 70 },
        typecheck: { passed: true, points: 15 },
        build: { passed: false, points: 15 },
      },
    },
    hasLaterEvaluation: false,
    ...overrides,
  }
}

function createRepository(items: Array<Record<string, unknown>> = []) {
  return {
    listResumableHandoffRuns: () => [],
    listResultSummaries: () => ({
      items,
      total: items.length,
      limit: 20,
      offset: 0,
      hasPrevious: false,
      hasNext: false,
    }),
  }
}

function createRunner(
  answers: unknown[],
  items: Array<Record<string, unknown>> = [],
  dependencies: Record<string, unknown> = {},
) {
  const terminal = new ScriptedTerminal(answers)
  const runner = new BenchmarkRunner({
    manifest,
    repoRoot,
    repository: createRepository(items),
    terminal,
    probeAdapters: async () => probes,
    ...dependencies,
  })
  return { runner, terminal }
}

test('home enables history and returns to the menu after an empty result list', async () => {
  const { runner, terminal } = createRunner(['results', 'exit'])

  const result = await runner.home()

  assert.deepEqual(result, { action: 'exit' })
  assert.match(terminal.output, /查看历史结果/)
  assert.match(terminal.output, /对比两次结果/)
  assert.doesNotMatch(terminal.output, /查看历史结果（后续版本）|对比两次结果（后续版本）/)
  assert.match(terminal.output, /还没有历史评测结果/)
})

test('history lets the user select a seeded run and inspect its safe detail', async () => {
  const detail = {
    schemaVersion: 2,
    type: 'result',
    run: {
      runId: RUN_A,
      displayId: '11111111',
      caseId: 'auth-session-hardening',
      title: '强化会话校验与注册安全',
      status: 'completed',
      adapterDisplayName: 'Codex CLI',
      versionNormalized: '0.144.5',
      requestedModel: 'gpt-5',
      effectiveModel: 'gpt-5-2026-07-01',
      requestedEffort: 'high',
      effectiveEffort: 'xhigh-runtime',
      runMode: 'handoff',
      dependencyStrategy: 'isolated',
      permissionPolicy: 'handoff_user_controlled',
      writeIsolation: 'unverified',
      secretIsolation: 'unverified',
      toolNetworkIsolation: 'unverified',
      executionConfigVerified: false,
      exposureState: 'blind',
      inputTokens: 1_000,
      outputTokens: 250,
      cachedTokens: 400,
      reasoningTokens: 75,
      cost: 0.42,
      agentDurationMs: 45_000,
    },
    evaluations: [{
      evaluationId: 'aaaaaaaa-1111-4111-8111-111111111111',
      label: 'PRIMARY',
      postExposure: false,
      score: 84.2,
      maxScore: 100,
      changedFileF1: 0.727,
      evaluationDurationMs: 12_345,
      checks: [
        { id: 'behavior', passed: true, points: 70 },
        { id: 'typecheck', passed: true, points: 15 },
        { id: 'build', passed: false, points: 15 },
      ],
    }, {
      evaluationId: 'bbbbbbbb-2222-4222-8222-222222222222',
      label: 'LATEST',
      postExposure: true,
      score: 90,
      maxScore: 100,
      changedFileF1: 0.8,
      evaluationDurationMs: 10_000,
      checks: [],
    }],
  }
  const { runner, terminal } = createRunner(
    ['results', `detail:${RUN_A}`, 'back', 'home', 'exit'],
    [makeSummary(RUN_A)],
    { buildResultDetail: () => detail },
  )

  await runner.home()

  assert.match(terminal.output, /历史结果/)
  assert.match(terminal.output, /11111111.*强化会话校验与注册安全.*84\.2\/100/)
  assert.match(terminal.output, /结果详情/)
  assert.match(
    terminal.output,
    /PRIMARY.*aaaaaaaa-1111-4111-8111-111111111111.*84\.2\/100/,
  )
  assert.match(
    terminal.output,
    /LATEST.*POST-EXPOSURE.*bbbbbbbb-2222-4222-8222-222222222222.*90\/100/,
  )
  assert.match(terminal.output, /行为测试.*通过/)
  assert.match(terminal.output, /生产构建.*失败/)
  assert.match(terminal.output, /Agent.*Codex CLI/)
  assert.match(terminal.output, /模型.*gpt-5/)
  assert.match(terminal.output, /Effort.*high/)
  assert.match(terminal.output, /依赖策略.*isolated/)
  assert.match(terminal.output, /Agent 用时.*45\.0s/)
  assert.match(terminal.output, /评价用时.*12\.3s/)
  assert.match(terminal.output, /Tokens.*1000\/250\/400\/75/)
  assert.match(terminal.output, /费用.*0\.42/)
})

test('history rows show the complete primary summary without replacing it with latest', async () => {
  const { runner, terminal } = createRunner(
    ['results', 'home', 'exit'],
    [makeSummary(RUN_A, { hasLaterEvaluation: true })],
  )

  await runner.home()

  assert.match(terminal.output, /11111111.*auth-session-hardening.*completed/)
  assert.match(terminal.output, /Codex CLI.*0\.144\.5/)
  assert.match(terminal.output, /模型.*gpt-5.*Effort.*high/)
  assert.match(terminal.output, /Primary.*84\.2\/100.*latest 另有结果/i)
  assert.match(terminal.output, /行为.*通过.*类型.*通过.*构建.*失败/)
  assert.match(terminal.output, /路径 F1.*72\.7%/)
  assert.match(terminal.output, /Agent 用时.*45\.0s/)
  assert.match(terminal.output, /评价时间.*2026-07-19T02:00:10\.000Z/)
  assert.match(terminal.output, /准备时探测，实际执行未验证/)
})

test('history rows name split behavior domains independently', async () => {
  const { runner, terminal } = createRunner(
    ['results', 'home', 'exit'],
    [makeSummary(RUN_A, {
      primaryEvaluation: {
        id: 'aaaaaaaa-1111-4111-8111-111111111111',
        score: 72,
        maxScore: 100,
        changedFileF1: 0.7,
        checks: {
          sanitizer: { passed: true, points: 25 },
          auth: { passed: false, points: 20 },
          'client-session': { passed: true, points: 15 },
          'security-headers': { passed: false, points: 10 },
          typecheck: { passed: true, points: 15 },
          build: { passed: true, points: 15 },
        },
      },
    })],
  )

  await runner.home()

  assert.match(terminal.output, /富文本清洗.*通过/)
  assert.match(terminal.output, /认证.*失败/)
  assert.match(terminal.output, /客户端会话.*通过/)
  assert.match(terminal.output, /安全头.*失败/)
  assert.match(terminal.output, /类型检查.*通过.*生产构建.*通过/)
  assert.doesNotMatch(terminal.output, /行为测试/)
})

test('history marks an unevaluated ad-hoc run score and agent configuration as unknown', async () => {
  const { runner, terminal } = createRunner(
    ['results', 'home', 'exit'],
    [makeSummary(RUN_C, {
      displayId: '33333333',
      adapterId: null,
      adapterDisplayName: null,
      requestedModel: null,
      requestedEffort: null,
      runMode: 'ad-hoc',
      primaryEvaluation: null,
    })],
  )

  await runner.home()

  assert.match(
    terminal.output,
    /33333333.*—.*Agent 未知.*模型 未知.*Effort 未知/,
  )
})

test('history marks a completed Run that only has non-primary evaluations', async () => {
  const { runner, terminal } = createRunner(
    ['results', 'home', 'exit'],
    [makeSummary(RUN_C, {
      displayId: '33333333',
      primaryEvaluation: null,
      hasNonPrimaryEvaluation: true,
    })],
  )

  await runner.home()

  assert.match(terminal.output, /33333333.*仅有 non-primary 评价/)
})

test('detail disables comparison when the Run has no primary evaluation', async () => {
  const detail = {
    run: {
      runId: RUN_C,
      displayId: '33333333',
      caseId: 'auth-session-hardening',
      title: '强化会话校验与注册安全',
      status: 'completed',
      primaryEvaluationId: null,
    },
    evaluations: [],
  }
  const { runner, terminal } = createRunner(
    ['results', `detail:${RUN_C}`, 'back', 'home', 'exit'],
    [makeSummary(RUN_C, {
      displayId: '33333333',
      primaryEvaluation: null,
      hasNonPrimaryEvaluation: true,
    })],
    { buildResultDetail: () => detail },
  )

  await runner.home()

  assert.match(terminal.output, /以此 Run 发起对比（需要 primary）.*不可用/)
})

test('history applies and clears case, adapter, model, and local-day filters', async () => {
  const requestedFilters: Array<Record<string, unknown>> = []
  const repository = {
    listResumableHandoffRuns: () => [],
    listResultSummaries: (filters: Record<string, unknown>) => {
      requestedFilters.push({ ...filters })
      const filtered = filters.caseId === 'auth-session-hardening'
      const items = filtered
        ? [makeSummary(RUN_B, { displayId: '22222222', title: '筛选后的结果' })]
        : [makeSummary(RUN_A)]
      return {
        items,
        total: items.length,
        limit: 20,
        offset: 0,
        hasPrevious: false,
        hasNext: false,
      }
    },
  }
  const { runner, terminal } = createRunner(
    [
      'results',
      'filter',
      'auth-session-hardening',
      'claude',
      'claude-opus-4-1',
      '2026-07-18',
      '2026-07-19',
      'clear',
      'home',
      'exit',
    ],
    [],
    { repository },
  )

  await runner.home()

  const applied = requestedFilters[1]
  assert.equal(applied.caseId, 'auth-session-hardening')
  assert.equal(applied.adapterId, 'claude')
  assert.equal(applied.requestedModel, 'claude-opus-4-1')
  assert.equal(new Date(String(applied.from)).getHours(), 0)
  assert.equal(new Date(String(applied.to)).getHours(), 23)
  assert.equal(new Date(String(applied.to)).getMinutes(), 59)
  assert.deepEqual(requestedFilters[2], { limit: 20, offset: 0 })
  assert.match(terminal.output, /筛选后的结果/)
})

test('an empty filtered page can be cleared without leaving history', async () => {
  const repository = {
    listResumableHandoffRuns: () => [],
    listResultSummaries: (filters: Record<string, unknown>) => ({
      items: filters.caseId === undefined ? [makeSummary(RUN_A)] : [],
      total: filters.caseId === undefined ? 1 : 0,
      limit: 20,
      offset: 0,
      hasPrevious: false,
      hasNext: false,
    }),
  }
  const { runner, terminal } = createRunner(
    [
      'results',
      'filter',
      'auth-session-hardening',
      '',
      '',
      '',
      '',
      'clear',
      'home',
      'exit',
    ],
    [],
    { repository },
  )

  await runner.home()

  assert.match(terminal.output, /筛选无结果/)
  assert.match(terminal.output, /清除筛选/)
  assert.match(terminal.output, /11111111.*强化会话校验与注册安全/)
})

test('invalid history dates stay in the filter flow and can be corrected', async () => {
  const { runner, terminal } = createRunner(
    [
      'results',
      'filter',
      '',
      '',
      '',
      '2026-02-30',
      '',
      '',
      '',
      '',
      '',
      '',
      'home',
      'exit',
    ],
    [makeSummary(RUN_A)],
  )

  await runner.home()

  assert.match(terminal.output, /筛选条件无效.*无效日期/)
  assert.match(terminal.output, /11111111.*强化会话校验与注册安全/)
})

test('history moves to the next page and back without dropping filters', async () => {
  const offsets: number[] = []
  const repository = {
    listResumableHandoffRuns: () => [],
    listResultSummaries: (filters: Record<string, unknown>) => {
      const offset = Number(filters.offset)
      offsets.push(offset)
      const onSecondPage = offset === 20
      return {
        items: [onSecondPage
          ? makeSummary(RUN_B, { displayId: '22222222', title: '第二页结果' })
          : makeSummary(RUN_A, { title: '第一页结果' })],
        total: 21,
        limit: 20,
        offset,
        hasPrevious: onSecondPage,
        hasNext: !onSecondPage,
      }
    },
  }
  const { runner, terminal } = createRunner(
    ['results', 'next', 'previous', 'home', 'exit'],
    [],
    { repository },
  )

  await runner.home()

  assert.deepEqual(offsets, [0, 20, 0])
  assert.match(terminal.output, /第一页结果/)
  assert.match(terminal.output, /第二页结果/)
  assert.match(terminal.output, /下一页/)
  assert.match(terminal.output, /上一页/)
})

test('compare explains that two primary evaluations are required', async () => {
  const { runner, terminal } = createRunner(
    ['compare', 'exit'],
    [makeSummary(RUN_A)],
  )

  await runner.home()

  assert.match(terminal.output, /至少需要两条已完成 primary 评价/)
  assert.match(terminal.output, /先完成更多评测/)
})

test('compare selects two distinct primary runs and prints their warning', async () => {
  const comparison = {
    schemaVersion: 2,
    type: 'comparison',
    comparability: {
      level: 'caution',
      warnings: [{
        code: 'model_mismatch',
        message: '模型不同，结果需谨慎解释',
      }],
    },
    runA: {
      runId: RUN_A,
      displayId: '11111111',
      caseId: 'auth-session-hardening',
      title: '强化会话校验与注册安全',
      adapterDisplayName: 'Codex CLI',
      versionNormalized: '0.144.5',
      requestedModel: 'gpt-5',
      effectiveModel: 'gpt-5-2026-07-01',
      requestedEffort: 'high',
      effectiveEffort: 'xhigh-runtime',
      runMode: 'handoff',
      dependencyStrategy: 'isolated',
      permissionPolicy: 'handoff_user_controlled',
      writeIsolation: 'unverified',
      secretIsolation: 'unverified',
      toolNetworkIsolation: 'unverified',
      executionConfigVerified: false,
      exposureState: 'blind',
      inputTokens: 1_000,
      outputTokens: 250,
      cachedTokens: 400,
      reasoningTokens: 75,
      cost: 0.42,
      score: 84.2,
      maxScore: 100,
      changedFileF1: 0.727,
      agentDurationMs: 45_000,
      evaluationDurationMs: 12_345,
      checks: [
        { id: 'sanitizer', passed: true },
        { id: 'auth', passed: false },
        { id: 'client-session', passed: true },
        { id: 'security-headers', passed: true },
        { id: 'typecheck', passed: true },
        { id: 'build', passed: false },
      ],
    },
    runB: {
      runId: RUN_B,
      displayId: '22222222',
      caseId: 'auth-session-hardening',
      title: '强化会话校验与注册安全',
      adapterDisplayName: 'Claude Code',
      versionNormalized: '2.1.215',
      requestedModel: 'claude-opus-4-1',
      effectiveModel: 'claude-opus-4-1-20260701',
      requestedEffort: 'high',
      effectiveEffort: 'high-runtime',
      runMode: 'handoff',
      dependencyStrategy: 'isolated',
      permissionPolicy: 'handoff_user_controlled',
      writeIsolation: 'unverified',
      secretIsolation: 'unverified',
      toolNetworkIsolation: 'unverified',
      executionConfigVerified: false,
      exposureState: 'blind',
      inputTokens: 1_200,
      outputTokens: 300,
      cachedTokens: 500,
      reasoningTokens: 90,
      cost: 0.55,
      score: 90,
      maxScore: 100,
      changedFileF1: 0.8,
      agentDurationMs: 50_000,
      evaluationDurationMs: 10_000,
      checks: [
        { id: 'sanitizer', passed: true },
        { id: 'auth', passed: true },
        { id: 'client-session', passed: false },
        { id: 'security-headers', passed: true },
        { id: 'typecheck', passed: true },
        { id: 'build', passed: true },
      ],
    },
  }
  const { runner, terminal } = createRunner(
    ['compare', RUN_A, RUN_B, 'exit'],
    [
      makeSummary(RUN_A),
      makeSummary(RUN_B, {
        displayId: '22222222',
        adapterId: 'claude',
        adapterDisplayName: 'Claude Code',
        requestedModel: 'claude-opus-4-1',
        primaryEvaluation: {
          id: 'bbbbbbbb-2222-4222-8222-222222222222',
          score: 90,
          maxScore: 100,
        },
      }),
    ],
    { buildResultComparison: () => comparison },
  )

  await runner.home()

  assert.match(terminal.output, /选择 Run A/)
  const runBChoices = terminal.output.split('选择 Run B\n')[1]?.split('请选择')[0] ?? ''
  assert.doesNotMatch(runBChoices, /11111111/)
  assert.match(runBChoices, /22222222/)
  assert.match(terminal.output, /对比结果.*CAUTION/i)
  assert.match(terminal.output, /11111111.*84\.2\/100.*\|.*22222222.*90\/100/)
  assert.match(terminal.output, /Case.*auth-session-hardening.*\|.*auth-session-hardening/)
  assert.match(terminal.output, /Agent.*Codex CLI.*\|.*Claude Code/)
  assert.match(
    terminal.output,
    /模型.*gpt-5.*gpt-5-2026-07-01.*\|.*claude-opus-4-1.*claude-opus-4-1-20260701/,
  )
  assert.match(terminal.output, /Effort.*high.*xhigh-runtime.*\|.*high.*high-runtime/)
  assert.match(terminal.output, /富文本清洗.*通过.*\|.*通过/)
  assert.match(terminal.output, /认证.*失败.*\|.*通过/)
  assert.match(terminal.output, /客户端会话.*通过.*\|.*失败/)
  assert.match(terminal.output, /安全头.*通过.*\|.*通过/)
  assert.match(terminal.output, /生产构建.*失败.*\|.*通过/)
  assert.match(terminal.output, /路径 F1.*72\.7%.*\|.*80\.0%/)
  assert.match(terminal.output, /Agent 用时.*45\.0s.*\|.*50\.0s/)
  assert.match(terminal.output, /评价用时.*12\.3s.*\|.*10\.0s/)
  assert.match(terminal.output, /Tokens.*1000\/250\/400\/75.*\|.*1200\/300\/500\/90/)
  assert.match(terminal.output, /费用.*0\.42.*\|.*0\.55/)
  assert.match(terminal.output, /模型不同，结果需谨慎解释/)
  assert.ok(
    terminal.output.indexOf('⚠ 模型不同') < terminal.output.indexOf('Agent · Codex CLI'),
  )
})

test('compare loads primary candidates beyond the first repository page', async () => {
  const offsets: number[] = []
  const repository = {
    listResumableHandoffRuns: () => [],
    listResultSummaries: ({ offset }: { offset: number }) => {
      offsets.push(offset)
      if (offset === 0) {
        return {
          items: Array.from({ length: 100 }, (_, index) => makeSummary(
            `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            { primaryEvaluation: null },
          )),
          total: 102,
          limit: 100,
          offset: 0,
          hasPrevious: false,
          hasNext: true,
        }
      }
      return {
        items: [makeSummary(RUN_A), makeSummary(RUN_B)],
        total: 102,
        limit: 100,
        offset: 100,
        hasPrevious: true,
        hasNext: false,
      }
    },
  }
  const comparison = {
    comparability: { level: 'fair', warnings: [] },
    runA: { runId: RUN_A, displayId: '11111111', score: 80, maxScore: 100 },
    runB: { runId: RUN_B, displayId: '22222222', score: 90, maxScore: 100 },
  }
  const { runner } = createRunner(
    [RUN_A, RUN_B],
    [],
    {
      repository,
      buildResultComparison: () => comparison,
    },
  )

  const result = await runner.compareFlow()

  assert.deepEqual(offsets, [0, 100])
  assert.equal(result.action, 'compared')
  assert.equal(result.comparison.runA.runId, RUN_A)
  assert.equal(result.comparison.runB.runId, RUN_B)
})
