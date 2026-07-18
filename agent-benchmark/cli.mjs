#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { loadManifest, sortedCases, validateManifest } from './src/catalog.mjs'
import { diagnoseEnvironment } from './src/doctor.mjs'
import {
  defaultWorkspace,
  evaluateBaselineCase,
  evaluateCase,
  evaluateReferenceCase,
  prepareCase,
} from './src/engine.mjs'

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
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('-')) throw new Error(`${name} requires a value`)
  return value
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
  agent-benchmark list [--json]
  agent-benchmark show <id> [--json]
  agent-benchmark doctor [--json]
  agent-benchmark validate [<id>] [--run-gold] [--reveal-check-output] [--json]
  agent-benchmark prepare <id> [--workspace <path>] [--link-dependencies] [--json]
  agent-benchmark evaluate <id> --workspace <path> [--results <path>] [--keep-evaluation] [--reveal-check-output] [--json]
  agent-benchmark help`)
}

const [command = 'help', ...args] = process.argv.slice(2)

if (command === 'list') {
  const cases = loadCases()
  if (args.includes('--json')) {
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
  } else if (args.includes('--json')) {
    console.log(JSON.stringify(benchmarkCase, null, 2))
  } else {
    console.log(`#${benchmarkCase.rank} ${benchmarkCase.title} (${benchmarkCase.id})`)
    console.log(`\n任务\n${benchmarkCase.prompt}`)
    console.log('\n验收标准')
    for (const criterion of benchmarkCase.acceptanceCriteria) console.log(`- ${criterion}`)
  }
} else if (command === 'doctor') {
  const diagnosis = diagnoseEnvironment(manifest, repoRoot)
  if (args.includes('--json')) {
    console.log(JSON.stringify(diagnosis, null, 2))
  } else {
    console.log(`Environment: ${diagnosis.ready ? 'ready' : 'not ready'}`)
    console.log(`Source worktree: ${diagnosis.sourceDirty ? 'dirty (safe: snapshots use git archive)' : 'clean'}`)
    for (const [name, tool] of Object.entries(diagnosis.tools)) {
      console.log(`${tool.available ? 'OK' : 'MISSING'}  ${name} ${tool.version}`)
    }
    console.log(`${diagnosis.dependencies.available ? 'OK' : 'MISSING'}  node_modules`)
    console.log(`${diagnosis.manifest.valid ? 'OK' : 'INVALID'}  benchmark manifest`)
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
  if (args.includes('--json')) {
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

    if (args.includes('--json')) {
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
  try {
    assertManifestValid()
    const id = positionalId(args, ['--workspace', '--results'])
    const benchmarkCase = id ? findCase(id) : undefined
    if (!benchmarkCase) throw new Error(id ? `Unknown benchmark case: ${id}` : 'Missing benchmark case id')

    const requestedWorkspace = optionValue(args, '--workspace')
    const workspace = requestedWorkspace
      ? resolve(process.cwd(), requestedWorkspace)
      : defaultWorkspace(repoRoot, benchmarkCase.id)
    const requestedResults = optionValue(args, '--results')
    const resultsDirectory = requestedResults
      ? resolve(process.cwd(), requestedResults)
      : resolve(repoRoot, '.agent-benchmark', 'results')
    const report = evaluateCase({
      benchmarkCase,
      repoRoot,
      workspace,
      resultsDirectory,
      keepEvaluation: args.includes('--keep-evaluation'),
      revealCheckOutput: args.includes('--reveal-check-output'),
    })

    if (args.includes('--json')) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      console.log(`${report.title} (${report.caseId})`)
      for (const check of report.checks) {
        console.log(`${check.passed ? 'PASS' : 'FAIL'}  ${check.label}  ${check.passed ? check.points : 0}/${check.points}`)
      }
      console.log(`FILES  F1 ${(report.scoring.changedFiles.f1 * 100).toFixed(1)}%  ${report.scoring.changedFiles.matchedCount}/${report.scoring.changedFiles.referenceCount} reference paths`)
      console.log(`Score: ${report.score}/${report.maxScore}`)
      console.log(`Report: ${report.reportFile}`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  }
} else if (command === 'help' || command === '--help' || command === '-h') {
  printHelp()
} else {
  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exitCode = 1
}
