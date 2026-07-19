#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { probeAdapters } from './src/adapters.mjs'
import { loadManifest, sortedCases, validateManifest } from './src/catalog.mjs'
import { assertSafeDatabasePath } from './src/database-path.mjs'
import { diagnoseEnvironment } from './src/doctor.mjs'
import {
  defaultWorkspace,
  evaluateBaselineCase,
  evaluateReferenceCase,
  prepareCase,
} from './src/engine.mjs'
import { BenchmarkRunner } from './src/runner.mjs'
import { buildResultComparison } from './src/results.mjs'
import { createReadlineTerminal, TerminalCancelledError } from './src/terminal.mjs'

const manifestPath = fileURLToPath(new URL('./benchmarks.json', import.meta.url))
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const manifest = loadManifest(manifestPath)

function loadCases() {
  return sortedCases(manifest)
}

function findCase(id) {
  return loadCases().find(benchmarkCase => benchmarkCase.id === id)
}

function assertManifestValid() {
  const validation = validateManifest(manifest, repoRoot)
  if (!validation.valid) {
    throw new Error(`Benchmark manifest is invalid: ${validation.errors[0]}`)
  }
}

function harnessOnlyCase(benchmarkCase, harnessFile) {
  const behaviorCheck = benchmarkCase.checks.find(check => check.kind === 'vitest')
  return {
    ...benchmarkCase,
    checks: [
      {
        id: 'harness',
        kind: 'vitest',
        label: 'Benchmark 补充 oracle 判别测试',
        files: [harnessFile.destination],
        points: 100,
        timeoutMs: behaviorCheck?.timeoutMs ?? 120000,
      },
    ],
  }
}

function optionValue(args, name) {
  const values = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue
    const value = args[index + 1]
    if (!value || value.startsWith('-')) throw new Error(`${name} requires a value`)
    values.push(value)
  }
  if (new Set(values).size > 1) throw new Error(`${name} was provided with conflicting values`)
  return values[0]
}

function positionalId(args, valueOptions) {
  for (let index = 0; index < args.length; index += 1) {
    if (valueOptions.includes(args[index])) {
      index += 1
      continue
    }
    if (!args[index].startsWith('-')) return args[index]
  }
  return undefined
}

function positionalValues(args, valueOptions) {
  const values = []
  for (let index = 0; index < args.length; index += 1) {
    if (valueOptions.includes(args[index])) {
      index += 1
      continue
    }
    if (!args[index].startsWith('-')) values.push(args[index])
  }
  return values
}

function assertKnownValueOptions(args, command, valueOptions) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (valueOptions.includes(argument)) {
      index += 1
      continue
    }
    if (argument.startsWith('-')) {
      throw new Error(`${command} 不支持选项：${argument}`)
    }
  }
}

function printCases(cases) {
  const rows = cases.map(benchmarkCase => ({
    rank: String(benchmarkCase.rank),
    id: benchmarkCase.id,
    difficulty: benchmarkCase.difficulty,
    commit: benchmarkCase.referenceCommit.slice(0, 8),
    title: benchmarkCase.title,
  }))
  console.table(rows)
}

function printHelp() {
  console.log(`Paper Agent Benchmark

Usage:
  agent-benchmark                         # 中文交互首页（TTY）
  agent-benchmark run [options]
  agent-benchmark resume [<run-id>]
  agent-benchmark evaluate <run-id>
  agent-benchmark results [--case <id>] [--adapter <id>] [--model <model>] [--from <date>] [--to <date>] [--limit <n>] [--offset <n>] [--json]
  agent-benchmark compare <run-a> <run-b> [--evaluation-a <uuid>] [--evaluation-b <uuid>] [--json]
  agent-benchmark list [--json]
  agent-benchmark show <id> [--json]
  agent-benchmark doctor [--json]
  agent-benchmark validate [<id>] [--run-gold] [--reveal-check-output] [--json]
  agent-benchmark prepare <id> [--workspace <path>] [--link-dependencies] [--json]
  agent-benchmark evaluate <id> --workspace <path> [--results <path>] [--keep-evaluation] [--reveal-check-output] [--json]
  agent-benchmark result <run-id> [--json]
  agent-benchmark db recover [<spool>] [--json]
  agent-benchmark help`)
}

function parseGlobalArguments(argv) {
  const args = []
  const databasePaths = []
  let json = false
  let jsonl = false
  let noColor = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--db') {
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) throw new Error('--db requires a value')
      databasePaths.push(resolve(process.cwd(), value))
      index += 1
      continue
    }
    if (argument === '--json') {
      json = true
      continue
    }
    if (argument === '--jsonl') {
      jsonl = true
      continue
    }
    if (argument === '--no-color') {
      noColor = true
      continue
    }
    args.push(argument)
  }
  if (new Set(databasePaths).size > 1) {
    throw new Error('--db was provided with conflicting values')
  }
  if (json && jsonl) throw new Error('--json and --jsonl cannot be used together')
  if (jsonl) throw new Error('--jsonl will be available with the managed-run path; use --json for now')
  return {
    args,
    databasePath: databasePaths[0],
    json,
    noColor,
  }
}

function assertV2NodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  if (major < 22) {
    throw new Error(`Benchmark CLI v2 需要 Node.js 22 或更高版本；当前为 ${process.version}`)
  }
}

function nonInteractiveTerminal(output = process.stdout) {
  const cannotPrompt = () => {
    throw new Error('非交互终端缺少必填参数，无法打开向导')
  }
  return {
    write(value) {
      output.write(String(value))
    },
    select: cannotPrompt,
    input: cannotPrompt,
    confirm: cannotPrompt,
    close() {},
  }
}

async function createRunnerResources({
  databasePath,
  terminal,
  candidateWorkspaces = [],
  recoverSpools = true,
}) {
  assertV2NodeVersion()
  const {
    BenchmarkRepository,
    defaultDatabasePath,
  } = await import('./src/repository.mjs')
  const safeDatabasePath = assertSafeDatabasePath({
    databasePath: databasePath ?? defaultDatabasePath(repoRoot),
    repoRoot,
    candidateWorkspaces,
  })
  const repository = new BenchmarkRepository(safeDatabasePath)
  try {
    assertSafeDatabasePath({
      databasePath: safeDatabasePath,
      repoRoot,
      candidateWorkspaces: [
        ...candidateWorkspaces,
        ...repository.listRuns().map(run => run.workspace),
      ],
    })
  } catch (error) {
    repository.close()
    throw error
  }
  const runner = new BenchmarkRunner({
    manifest,
    repoRoot,
    repository,
    terminal,
  })
  if (recoverSpools) {
    const recovered = runner.recoverEvaluationSpools()
    if (recovered.length > 0) {
      terminal.write(`已自动恢复 ${recovered.length} 个评价结果。\n`)
    }
  }
  return { repository, runner }
}

function printReport(report) {
  console.log(`${report.title} (${report.caseId})`)
  for (const check of report.checks) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'}  ${check.label}  ${check.passed ? check.points : 0}/${check.points}`)
  }
  console.log(`FILES  F1 ${(report.scoring.changedFiles.f1 * 100).toFixed(1)}%  ${report.scoring.changedFiles.matchedCount}/${report.scoring.changedFiles.referenceCount} reference paths`)
  console.log(`Score: ${report.score}/${report.maxScore}`)
  console.log(`Report: ${report.reportFile}`)
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '未知'
  return `${(milliseconds / 1000).toFixed(1)} 秒`
}

function formatCheckStatus(check) {
  if (check === null || check === undefined) return '—'
  return check.passed ? '通过' : '失败'
}

function printResultSummary(item) {
  const displayId = item.displayId ?? item.id.slice(0, 8)
  const agent = item.adapterDisplayName ?? item.adapterId ?? '未知'
  const version = item.versionNormalized ?? '版本未知'
  const model = item.requestedModel ?? '未知'
  const effort = item.requestedEffort ?? '未知'
  const primary = item.primaryEvaluation
  const configuration = item.executionConfigVerified
    ? '配置已验证'
    : item.runMode === 'handoff'
      ? '准备时探测，实际执行未验证'
      : '配置未验证'
  console.log(`${displayId}  ${item.caseId}  ${item.status}`)
  console.log(
    `  Agent  ${agent} ${version}  |  模型 ${model}`
    + `  |  思考深度 ${effort}  |  ${configuration}`,
  )
  if (!primary) {
    const nonPrimary = item.hasNonPrimaryEvaluation
      ? '  |  仅有 non-primary 评价'
      : ''
    console.log(`  Primary  —${nonPrimary}  |  行为 —  类型 —  构建 —  |  路径 F1 —`)
    console.log(`  Agent 用时 ${formatDuration(item.agentDurationMs)}  |  最近活动 ${item.activityAt}`)
    return
  }
  const later = item.hasLaterEvaluation ? '  |  latest 另有结果' : ''
  console.log(`  Primary  ${primary.score}/${primary.maxScore}${later}`)
  console.log(
    `  行为 ${formatCheckStatus(primary.checks.behavior)}`
    + `  类型 ${formatCheckStatus(primary.checks.typecheck)}`
    + `  构建 ${formatCheckStatus(primary.checks.build)}`,
  )
  const f1 = Number.isFinite(primary.changedFileF1)
    ? `${(primary.changedFileF1 * 100).toFixed(1)}%`
    : '—'
  console.log(
    `  路径 F1 ${f1}  |  Agent 用时 ${formatDuration(item.agentDurationMs)}`
    + `  |  评价时间 ${item.activityAt}`,
  )
}

function valueOrUnknown(value) {
  return value === null || value === undefined || value === '' ? '未知' : String(value)
}

function comparisonCheck(side, id) {
  return side.checks.find(check => check.id === id)
}

function comparisonLine(label, left, right) {
  console.log(`${label}  ${left}  |  ${right}`)
}

function printResultComparison(comparison) {
  const left = comparison.runA
  const right = comparison.runB
  console.log(
    `对比 ${left.displayId} ↔ ${right.displayId}`
    + `  [${comparison.comparability.level.toUpperCase()}]`,
  )
  for (const warning of comparison.comparability.warnings) {
    console.log(`警告：${warning.message}`)
  }
  comparisonLine('Case', left.caseId, right.caseId)
  comparisonLine(
    'Agent / CLI',
    `${valueOrUnknown(left.adapterDisplayName)} ${valueOrUnknown(left.versionNormalized)}`,
    `${valueOrUnknown(right.adapterDisplayName)} ${valueOrUnknown(right.versionNormalized)}`,
  )
  comparisonLine(
    'Requested model',
    `${valueOrUnknown(left.requestedModel)} / ${valueOrUnknown(left.effectiveModel)}`,
    `${valueOrUnknown(right.requestedModel)} / ${valueOrUnknown(right.effectiveModel)}`,
  )
  comparisonLine(
    '思考深度',
    `${valueOrUnknown(left.requestedEffort)} / ${valueOrUnknown(left.effectiveEffort)}`,
    `${valueOrUnknown(right.requestedEffort)} / ${valueOrUnknown(right.effectiveEffort)}`,
  )
  comparisonLine('运行方式', valueOrUnknown(left.runMode), valueOrUnknown(right.runMode))
  comparisonLine(
    '依赖策略',
    valueOrUnknown(left.dependencyStrategy),
    valueOrUnknown(right.dependencyStrategy),
  )
  comparisonLine(
    '权限策略',
    valueOrUnknown(left.permissionPolicy),
    valueOrUnknown(right.permissionPolicy),
  )
  comparisonLine(
    '写入 / Secret / 网络隔离',
    `${valueOrUnknown(left.writeIsolation)} / ${valueOrUnknown(left.secretIsolation)} / ${valueOrUnknown(left.toolNetworkIsolation)}`,
    `${valueOrUnknown(right.writeIsolation)} / ${valueOrUnknown(right.secretIsolation)} / ${valueOrUnknown(right.toolNetworkIsolation)}`,
  )
  comparisonLine(
    '执行配置',
    `${left.executionConfigVerified ? '已验证' : '未验证'} / ${valueOrUnknown(left.executionConfigSource)}`,
    `${right.executionConfigVerified ? '已验证' : '未验证'} / ${valueOrUnknown(right.executionConfigSource)}`,
  )
  comparisonLine(
    'Exposure',
    `${valueOrUnknown(left.exposureState)} / ${left.exposureTypes.join(', ') || '无'}`,
    `${valueOrUnknown(right.exposureState)} / ${right.exposureTypes.join(', ') || '无'}`,
  )
  comparisonLine(
    '评价口径',
    `${left.isPrimary ? 'PRIMARY' : 'ITERATION'}${left.postExposure ? ' / POST-EXPOSURE' : ''}`,
    `${right.isPrimary ? 'PRIMARY' : 'ITERATION'}${right.postExposure ? ' / POST-EXPOSURE' : ''}`,
  )
  comparisonLine('总分', `${left.score}/${left.maxScore}`, `${right.score}/${right.maxScore}`)
  for (const [id, label] of [
    ['behavior', '行为'],
    ['typecheck', '类型检查'],
    ['build', '生产构建'],
  ]) {
    comparisonLine(
      label,
      formatCheckStatus(comparisonCheck(left, id)),
      formatCheckStatus(comparisonCheck(right, id)),
    )
  }
  comparisonLine(
    '路径 F1',
    Number.isFinite(left.changedFileF1) ? `${(left.changedFileF1 * 100).toFixed(1)}%` : '—',
    Number.isFinite(right.changedFileF1) ? `${(right.changedFileF1 * 100).toFixed(1)}%` : '—',
  )
  comparisonLine(
    'Agent 用时',
    formatDuration(left.agentDurationMs),
    formatDuration(right.agentDurationMs),
  )
  comparisonLine(
    '评价耗时',
    formatDuration(left.evaluationDurationMs),
    formatDuration(right.evaluationDurationMs),
  )
  comparisonLine(
    'Tokens (input/output/cached/reasoning)',
    `${valueOrUnknown(left.inputTokens)}/${valueOrUnknown(left.outputTokens)}/${valueOrUnknown(left.cachedTokens)}/${valueOrUnknown(left.reasoningTokens)}`,
    `${valueOrUnknown(right.inputTokens)}/${valueOrUnknown(right.outputTokens)}/${valueOrUnknown(right.cachedTokens)}/${valueOrUnknown(right.reasoningTokens)}`,
  )
  comparisonLine('费用', valueOrUnknown(left.cost), valueOrUnknown(right.cost))
}

function integerOption(args, name, { defaultValue, min, max }) {
  const value = optionValue(args, name)
  if (value === undefined) return defaultValue
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}`)
  }
  return parsed
}

function localDateBoundary(value, name, endOfDay = false) {
  if (value === undefined) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`${name} must use YYYY-MM-DD`)
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  )
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    throw new Error(`${name} is not a valid calendar date`)
  }
  return date.toISOString()
}

let globals
try {
  globals = parseGlobalArguments(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
  globals = { args: ['__invalid__'], json: false }
}
const [command, ...args] = globals.args
const jsonOutput = globals.json

if (!command) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('无参数入口需要交互式终端。自动化请使用 run 并提供完整参数，或运行 help 查看用法。')
    process.exitCode = 2
  } else {
    const terminal = createReadlineTerminal({
      input: process.stdin,
      output: process.stdout,
    })
    let repository
    try {
      const resources = await createRunnerResources({
        databasePath: globals.databasePath,
        terminal,
      })
      repository = resources.repository
      await resources.runner.home()
    } catch (error) {
      if (error instanceof TerminalCancelledError) {
        console.log('\n已退出。')
      } else {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 2
      }
    } finally {
      repository?.close()
      terminal.close()
    }
  }
} else if (command === 'run') {
  const terminal = process.stdin.isTTY && process.stdout.isTTY && !jsonOutput
    ? createReadlineTerminal({ input: process.stdin, output: process.stdout })
    : nonInteractiveTerminal(jsonOutput ? process.stderr : process.stdout)
  let repository
  try {
    const caseId = optionValue(args, '--case')
      ?? positionalId(args, [
        '--case',
        '--adapter',
        '--executable',
        '--model',
        '--effort',
        '--mode',
        '--dependency-strategy',
        '--workspace',
      ])
    const adapterId = optionValue(args, '--adapter')
    const executable = optionValue(args, '--executable')
    const model = optionValue(args, '--model')
    const effort = optionValue(args, '--effort')
    const mode = optionValue(args, '--mode')
    const dependencyStrategy = optionValue(args, '--dependency-strategy')
    const workspace = optionValue(args, '--workspace')
    const yes = args.includes('--yes')
    const interactive = process.stdin.isTTY && process.stdout.isTTY && !jsonOutput
    if (!interactive) {
      const missing = [
        ['--case', caseId],
        ['--adapter', adapterId],
        ['--model', model],
        ['--effort', effort],
        ['--mode', mode],
        ['--dependency-strategy', dependencyStrategy],
        ['--yes', yes],
      ].filter(([, value]) => !value).map(([name]) => name)
      if (missing.length > 0) {
        throw new Error(`非交互 run 缺少必填参数：${missing.join(', ')}`)
      }
    }
    assertManifestValid()

    const resources = await createRunnerResources({
      databasePath: globals.databasePath,
      terminal,
      candidateWorkspaces: workspace
        ? [resolve(process.cwd(), workspace)]
        : [],
    })
    repository = resources.repository
    const result = await resources.runner.runWizard({
      caseId,
      adapterId,
      executable,
      model,
      effort,
      mode,
      dependencyStrategy,
      workspace: workspace ? resolve(process.cwd(), workspace) : undefined,
      yes,
      quiet: jsonOutput,
      waitForHandoff: interactive && !yes,
    })
    if (jsonOutput) {
      console.log(JSON.stringify({
        schemaVersion: 2,
        type: result.cancelled ? 'cancelled' : 'run',
        ...result,
      }, null, 2))
    }
  } catch (error) {
    if (error instanceof TerminalCancelledError) {
      if (!jsonOutput) console.log('\n已取消；未创建尚未确认的 Run 或 workspace。')
    } else {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 2
    }
  } finally {
    repository?.close()
    terminal.close()
  }
} else if (command === 'resume') {
  const terminal = process.stdin.isTTY && process.stdout.isTTY && !jsonOutput
    ? createReadlineTerminal({ input: process.stdin, output: process.stdout })
    : nonInteractiveTerminal(jsonOutput ? process.stderr : process.stdout)
  let repository
  try {
    const resources = await createRunnerResources({
      databasePath: globals.databasePath,
      terminal,
    })
    repository = resources.repository
    let runReference = positionalId(args, [])
    if (!runReference) {
      if (!process.stdin.isTTY || jsonOutput) {
        throw new Error('非交互 resume 需要 Run ID 或至少 8 位的唯一前缀')
      }
      const incomplete = repository.listResumableHandoffRuns()
      if (incomplete.length === 0) throw new Error('当前没有可恢复的未完成 Run')
      runReference = await terminal.select(
        '选择要恢复的 Run',
        incomplete.map(run => ({
          value: run.id,
          label: `${run.id.slice(0, 8)} · ${run.caseId} · ${run.status}`,
        })),
        { defaultIndex: 0 },
      )
    }
    const result = await resources.runner.resume(runReference, {
      waitForHandoff: Boolean(process.stdin.isTTY && process.stdout.isTTY && !jsonOutput),
      quiet: jsonOutput,
    })
    if (jsonOutput) {
      console.log(JSON.stringify({ schemaVersion: 2, type: 'resume', ...result }, null, 2))
    }
  } catch (error) {
    if (error instanceof TerminalCancelledError) {
      if (!jsonOutput) console.log('\n已暂停；Run 和 workspace 均已保留。')
    } else {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 2
    }
  } finally {
    repository?.close()
    terminal.close()
  }
} else if (command === 'compare') {
  let repository
  try {
    const compareOptions = ['--evaluation-a', '--evaluation-b']
    assertKnownValueOptions(args, 'compare', compareOptions)
    const runReferences = positionalValues(args, compareOptions)
    if (runReferences.length !== 2) {
      throw new Error('compare 需要且仅接受两个 Run ID 或唯一前缀')
    }
    const terminal = nonInteractiveTerminal(jsonOutput ? process.stderr : process.stdout)
    const resources = await createRunnerResources({
      databasePath: globals.databasePath,
      terminal,
    })
    repository = resources.repository
    const comparison = buildResultComparison(
      repository,
      runReferences[0],
      runReferences[1],
      {
        evaluationA: optionValue(args, '--evaluation-a'),
        evaluationB: optionValue(args, '--evaluation-b'),
      },
    )
    if (jsonOutput) {
      console.log(JSON.stringify(comparison, null, 2))
    } else {
      printResultComparison(comparison)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  } finally {
    repository?.close()
  }
} else if (command === 'results') {
  let repository
  try {
    const resultsOptions = [
      '--case',
      '--adapter',
      '--model',
      '--from',
      '--to',
      '--limit',
      '--offset',
    ]
    assertKnownValueOptions(args, 'results', resultsOptions)
    const unexpectedPositionals = positionalValues(args, resultsOptions)
    if (unexpectedPositionals.length > 0) {
      throw new Error(`results 不接受位置参数：${unexpectedPositionals.join(', ')}`)
    }
    const terminal = nonInteractiveTerminal(jsonOutput ? process.stderr : process.stdout)
    const resources = await createRunnerResources({
      databasePath: globals.databasePath,
      terminal,
    })
    repository = resources.repository
    const limit = integerOption(args, '--limit', { defaultValue: 20, min: 1, max: 100 })
    const offset = integerOption(args, '--offset', {
      defaultValue: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    })
    const caseId = optionValue(args, '--case')
    const adapterId = optionValue(args, '--adapter')
    const requestedModel = optionValue(args, '--model')
    const fromDate = optionValue(args, '--from')
    const toDate = optionValue(args, '--to')
    const from = localDateBoundary(fromDate, '--from')
    const to = localDateBoundary(toDate, '--to', true)
    if (from && to && Date.parse(from) > Date.parse(to)) {
      throw new Error('--from must not be after --to')
    }
    const page = repository.listResultSummaries({
      caseId,
      adapterId,
      requestedModel,
      from,
      to,
      limit,
      offset,
    })
    if (jsonOutput) {
      console.log(JSON.stringify({
        schemaVersion: 2,
        type: 'results',
        filters: {
          caseId: caseId ?? null,
          adapterId: adapterId ?? null,
          requestedModel: requestedModel ?? null,
          from: fromDate ?? null,
          to: toDate ?? null,
        },
        pagination: {
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          hasPrevious: page.hasPrevious,
          hasNext: page.hasNext,
        },
        results: page.items,
      }, null, 2))
    } else if (page.items.length === 0) {
      console.log('没有历史 Run。可运行 benchmark 开始新的评测。')
    } else {
      console.log(`历史结果 ${page.offset + 1}-${page.offset + page.items.length} / ${page.total}`)
      for (const item of page.items) printResultSummary(item)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  } finally {
    repository?.close()
  }
} else if (command === 'result') {
  let repository
  try {
    const terminal = nonInteractiveTerminal(jsonOutput ? process.stderr : process.stdout)
    const resources = await createRunnerResources({
      databasePath: globals.databasePath,
      terminal,
    })
    repository = resources.repository
    const runReference = positionalId(args, [])
    if (!runReference) throw new Error('Missing Run ID')
    const run = repository.getRun(runReference)
    const evaluations = repository.listEvaluations(run.id)
    if (jsonOutput) {
      console.log(JSON.stringify({ schemaVersion: 2, run, evaluations }, null, 2))
    } else {
      console.log(`${run.id.slice(0, 8)}  ${run.caseId}  ${run.status}`)
      console.log(`Agent: ${run.adapterDisplayName ?? '未知'} ${run.versionNormalized ?? ''}`.trimEnd())
      console.log(`Model / effort: ${run.requestedModel ?? '未知'} / ${run.requestedEffort ?? '未知'}`)
      console.log(run.executionConfigVerified
        ? '执行配置：已验证'
        : '执行配置：准备时探测，实际执行未验证')
      console.log(`Workspace: ${run.workspace}`)
      for (const evaluation of evaluations) {
        const label = evaluation.isPrimary
          ? 'PRIMARY'
          : evaluation.id === run.latestEvaluationId
            ? 'LATEST'
            : 'ITERATION'
        const exposure = evaluation.postExposure ? '  POST-EXPOSURE' : ''
        console.log(
          `${label}${exposure}  ${evaluation.id}`
          + `  ${evaluation.score}/${evaluation.maxScore}`,
        )
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  } finally {
    repository?.close()
  }
} else if (command === 'db' && args[0] === 'recover') {
  let repository
  try {
    const terminal = nonInteractiveTerminal(jsonOutput ? process.stderr : process.stdout)
    const resources = await createRunnerResources({
      databasePath: globals.databasePath,
      terminal,
      recoverSpools: false,
    })
    repository = resources.repository
    const spool = args[1] ? [resolve(process.cwd(), args[1])] : undefined
    const recovered = resources.runner.recoverEvaluationSpools(spool)
    if (jsonOutput) {
      console.log(JSON.stringify({ schemaVersion: 1, recovered }, null, 2))
    } else if (recovered.length === 0) {
      console.log('没有待恢复的评价结果。')
    } else {
      console.log(`已恢复 ${recovered.length} 个评价结果：${recovered.join(', ')}`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  } finally {
    repository?.close()
  }
} else if (command === 'list') {
  const cases = loadCases()
  if (jsonOutput) {
    console.log(JSON.stringify(cases, null, 2))
  } else {
    printCases(cases)
  }
} else if (command === 'show') {
  const id = args.find(arg => !arg.startsWith('-'))
  const benchmarkCase = id ? findCase(id) : undefined
  if (!benchmarkCase) {
    console.error(id ? `Unknown benchmark case: ${id}` : 'Missing benchmark case id')
    process.exitCode = 1
  } else if (jsonOutput) {
    console.log(JSON.stringify(benchmarkCase, null, 2))
  } else {
    console.log(`#${benchmarkCase.rank} ${benchmarkCase.title} (${benchmarkCase.id})`)
    console.log(`\n任务\n${benchmarkCase.prompt}`)
    console.log('\n验收标准')
    for (const criterion of benchmarkCase.acceptanceCriteria) console.log(`- ${criterion}`)
  }
} else if (command === 'doctor') {
  const diagnosis = diagnoseEnvironment(manifest, repoRoot)
  const agents = Object.fromEntries(
    (await probeAdapters()).map(agent => [agent.adapterId, agent]),
  )
  let sqlite = { available: false, version: null, error: null }
  try {
    const { default: Database } = await import('better-sqlite3')
    const database = new Database(':memory:')
    sqlite = {
      available: true,
      version: database.prepare('select sqlite_version() as version').get().version,
      error: null,
    }
    database.close()
  } catch (error) {
    sqlite.error = error instanceof Error ? error.message : String(error)
    diagnosis.ready = false
  }
  diagnosis.agents = agents
  diagnosis.sqlite = sqlite
  if (jsonOutput) {
    console.log(JSON.stringify(diagnosis, null, 2))
  } else {
    console.log(`Environment: ${diagnosis.ready ? 'ready' : 'not ready'}`)
    console.log(`Source worktree: ${diagnosis.sourceDirty ? 'dirty (safe: snapshots use git archive)' : 'clean'}`)
    for (const [name, tool] of Object.entries(diagnosis.tools)) {
      console.log(`${tool.available ? 'OK' : 'MISSING'}  ${name} ${tool.version}`)
    }
    console.log(`${diagnosis.dependencies.available ? 'OK' : 'MISSING'}  node_modules`)
    console.log(`${diagnosis.manifest.valid ? 'OK' : 'INVALID'}  benchmark manifest`)
    console.log(`${sqlite.available ? 'OK' : 'MISSING'}  SQLite ${sqlite.version ?? ''}`.trimEnd())
    for (const id of ['codex', 'claude']) {
      const agent = agents[id]
      console.log(`${agent?.found ? 'OK' : 'MISSING'}  ${agent?.displayName ?? id} ${agent?.versionNormalized ?? ''}`.trimEnd())
    }
  }
  if (!diagnosis.ready) process.exitCode = 2
} else if (command === 'validate') {
  const result = validateManifest(manifest, repoRoot)
  if (args.includes('--run-gold') && result.valid) {
    const id = positionalId(args, [])
    const selectedCases = id ? [findCase(id)].filter(Boolean) : loadCases()
    if (id && selectedCases.length === 0) {
      result.errors.push(`Unknown benchmark case: ${id}`)
    } else {
      result.baseline = []
      result.gold = []
      result.harnessBaseline = []
      result.harnessGold = []
      for (const benchmarkCase of selectedCases) {
        try {
          const baselineReport = evaluateBaselineCase({
            benchmarkCase,
            repoRoot,
            revealCheckOutput: args.includes('--reveal-check-output'),
          })
          result.baseline.push({
            caseId: baselineReport.caseId,
            score: baselineReport.score,
            maxScore: baselineReport.maxScore,
            durationMs: baselineReport.durationMs,
            checks: baselineReport.checks,
          })
          if (baselineReport.checks.every(check => check.passed)) {
            result.errors.push(`${benchmarkCase.id}: oracle tests do not reject the unsolved baseline`)
          }

          const report = evaluateReferenceCase({
            benchmarkCase,
            repoRoot,
            revealCheckOutput: args.includes('--reveal-check-output'),
          })
          result.gold.push({
            caseId: report.caseId,
            score: report.score,
            maxScore: report.maxScore,
            durationMs: report.durationMs,
            checks: report.checks,
          })
          if (report.score !== report.maxScore) {
            result.errors.push(`${benchmarkCase.id}: gold scored ${report.score}/${report.maxScore}`)
          }

          for (const harnessFile of benchmarkCase.harnessFiles ?? []) {
            const harnessCase = harnessOnlyCase(benchmarkCase, harnessFile)
            const harnessBaseline = evaluateBaselineCase({
              benchmarkCase: harnessCase,
              repoRoot,
              revealCheckOutput: args.includes('--reveal-check-output'),
            })
            result.harnessBaseline.push({
              caseId: benchmarkCase.id,
              score: harnessBaseline.score,
              maxScore: harnessBaseline.maxScore,
              durationMs: harnessBaseline.durationMs,
              checks: harnessBaseline.checks,
            })
            if (harnessBaseline.checks.every(check => check.passed)) {
              result.errors.push(`${benchmarkCase.id}: supplemental harness accepts the baseline`)
            }

            const harnessGold = evaluateReferenceCase({
              benchmarkCase: harnessCase,
              repoRoot,
              revealCheckOutput: args.includes('--reveal-check-output'),
            })
            result.harnessGold.push({
              caseId: benchmarkCase.id,
              score: harnessGold.score,
              maxScore: harnessGold.maxScore,
              durationMs: harnessGold.durationMs,
              checks: harnessGold.checks,
            })
            if (harnessGold.score !== harnessGold.maxScore) {
              result.errors.push(
                `${benchmarkCase.id}: supplemental harness rejects gold ` +
                `(${harnessGold.score}/${harnessGold.maxScore})`,
              )
            }
          }
        } catch (error) {
          result.errors.push(`${benchmarkCase.id}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
    result.valid = result.errors.length === 0
  }
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.valid) {
    console.log(`Manifest valid: ${result.caseCount} benchmark cases`)
  } else {
    console.error(`Manifest invalid (${result.errors.length} errors)`)
    for (const error of result.errors) console.error(`- ${error}`)
  }
  if (!result.valid) process.exitCode = 2
} else if (command === 'prepare') {
  try {
    assertManifestValid()
    const id = positionalId(args, ['--workspace'])
    const benchmarkCase = id ? findCase(id) : undefined
    if (!benchmarkCase) throw new Error(id ? `Unknown benchmark case: ${id}` : 'Missing benchmark case id')

    const requestedWorkspace = optionValue(args, '--workspace')
    const workspace = requestedWorkspace
      ? resolve(process.cwd(), requestedWorkspace)
      : defaultWorkspace(repoRoot, benchmarkCase.id)
    const prepared = prepareCase({
      benchmarkCase,
      repoRoot,
      workspace,
      linkDependencies: args.includes('--link-dependencies'),
    })

    if (jsonOutput) {
      console.log(JSON.stringify(prepared, null, 2))
    } else {
      console.log(`Prepared ${prepared.caseId}`)
      console.log(`Workspace: ${prepared.workspace}`)
      console.log(`Task: ${prepared.taskFile}`)
      console.log(prepared.dependenciesLinked ? 'Dependencies: linked' : 'Dependencies: not linked')
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  }
} else if (command === 'evaluate') {
  let repository
  try {
    assertManifestValid()
    const id = positionalId(args, ['--workspace', '--results'])
    if (!id) throw new Error('Missing benchmark case or Run id')

    const requestedWorkspace = optionValue(args, '--workspace')
    const requestedResults = optionValue(args, '--results')
    const resultsDirectory = requestedResults
      ? resolve(process.cwd(), requestedResults)
      : resolve(repoRoot, '.agent-benchmark', 'results')
    const terminal = nonInteractiveTerminal(jsonOutput ? process.stderr : process.stdout)
    const resources = await createRunnerResources({
      databasePath: globals.databasePath,
      terminal,
      candidateWorkspaces: requestedWorkspace
        ? [resolve(process.cwd(), requestedWorkspace)]
        : [],
    })
    repository = resources.repository
    const benchmarkCase = findCase(id)
    let report
    if (benchmarkCase) {
      const workspace = requestedWorkspace
        ? resolve(process.cwd(), requestedWorkspace)
        : defaultWorkspace(repoRoot, benchmarkCase.id)
      const evaluated = await resources.runner.evaluateAdHoc({
        benchmarkCase,
        workspace,
        resultsDirectory,
        keepEvaluation: args.includes('--keep-evaluation'),
        revealCheckOutput: args.includes('--reveal-check-output'),
        quiet: true,
      })
      report = evaluated.report
    } else if (/^(?:[0-9a-f]{8,32}|[0-9a-f-]{36})$/i.test(id)) {
      if (requestedWorkspace) {
        throw new Error('Run ID 模式禁止使用 --workspace 覆盖已记录的规范路径')
      }
      const evaluated = await resources.runner.evaluateRun(id, {
        resultsDirectory,
        keepEvaluation: args.includes('--keep-evaluation'),
        revealCheckOutput: args.includes('--reveal-check-output'),
        quiet: true,
      })
      report = evaluated.report
    } else {
      throw new Error(`Unknown benchmark case: ${id}`)
    }

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      printReport(report)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  } finally {
    repository?.close()
  }
} else if (command === 'help' || command === '--help' || command === '-h') {
  printHelp()
} else {
  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exitCode = 1
}
