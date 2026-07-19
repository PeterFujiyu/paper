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
      const incomplete = repository.listIncompleteRuns()
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
        console.log(`${evaluation.isPrimary ? 'PRIMARY' : 'LATEST'}  ${evaluation.id.slice(0, 8)}  ${evaluation.score}/${evaluation.maxScore}`)
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
