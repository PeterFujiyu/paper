import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { test } from 'vitest'

const testCwd = process.cwd()
const repoRoot = basename(testCwd) === 'agent-benchmark' ? resolve(testCwd, '..') : testCwd
const cliPath = join(repoRoot, 'agent-benchmark', 'cli.mjs')

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

function runGit(cwd: string, args: string[]) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' })
}

test('list --json returns exactly ten ranked benchmark cases', () => {
  const result = runCli(['list', '--json'])

  assert.equal(result.status, 0, result.stderr)
  const cases = JSON.parse(result.stdout) as Array<{
    rank: number
    referenceCommit: string
    harnessFiles?: Array<{ sha256: string }>
  }>
  assert.equal(cases.length, 10)
  assert.deepEqual(
    cases.map(benchmarkCase => benchmarkCase.rank),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  )
  assert.ok(cases.every(benchmarkCase => /^[0-9a-f]{40}$/.test(benchmarkCase.referenceCommit)))
  const harnessFiles = cases.flatMap(benchmarkCase => benchmarkCase.harnessFiles ?? [])
  assert.equal(harnessFiles.length, 6)
  assert.ok(harnessFiles.every(file => /^[0-9a-f]{64}$/.test(file.sha256)))
})

test('show --json exposes a complete task contract for one case', () => {
  const result = runCli(['show', 'serverless-route-dispatch', '--json'])

  assert.equal(result.status, 0, result.stderr)
  const benchmarkCase = JSON.parse(result.stdout) as {
    id: string
    baseCommit: string
    prompt: string
    acceptanceCriteria: string[]
    checks: Array<{ points: number }>
  }
  assert.equal(benchmarkCase.id, 'serverless-route-dispatch')
  assert.match(benchmarkCase.baseCommit, /^[0-9a-f]{40}$/)
  assert.ok(benchmarkCase.prompt.length > 100)
  assert.ok(benchmarkCase.acceptanceCriteria.length >= 3)
  assert.equal(
    benchmarkCase.checks.reduce((total, check) => total + check.points, 0),
    100,
  )
})

test('validate --json verifies all manifest entries against git history', () => {
  const result = runCli(['validate', '--json'])

  assert.equal(result.status, 0, result.stderr)
  const validation = JSON.parse(result.stdout) as {
    valid: boolean
    caseCount: number
    errors: string[]
    cases: Array<{ parentMatches: boolean; onSourceRef: boolean }>
  }
  assert.equal(validation.valid, true)
  assert.equal(validation.caseCount, 10)
  assert.equal(validation.errors.length, 0)
  assert.ok(validation.cases.every(benchmarkCase => benchmarkCase.parentMatches))
  assert.ok(validation.cases.every(benchmarkCase => benchmarkCase.onSourceRef))
}, 120_000)

test('doctor reports a ready local benchmark environment', () => {
  const result = runCli(['doctor', '--json'])

  assert.equal(result.status, 0, result.stderr)
  const diagnosis = JSON.parse(result.stdout) as {
    ready: boolean
    manifest: { valid: boolean }
    dependencies: { available: boolean }
    tools: Record<string, { available: boolean }>
  }
  assert.equal(diagnosis.ready, true)
  assert.equal(diagnosis.manifest.valid, true)
  assert.equal(diagnosis.dependencies.available, true)
  assert.ok(['git', 'npm', 'tar'].every(tool => diagnosis.tools[tool]?.available))
}, 60_000)

test('prepare creates a clean snapshot that cannot read the reference commit', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-test-'))
  const workspace = join(temporaryRoot, 'candidate')
  const statusBefore = runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']).stdout

  try {
    const result = runCli([
      'prepare',
      'hash-scroll-restoration',
      '--workspace',
      workspace,
      '--json',
    ])

    assert.equal(result.status, 0, result.stderr)
    const prepared = JSON.parse(result.stdout) as { caseId: string; workspace: string }
    assert.equal(prepared.caseId, 'hash-scroll-restoration')
    assert.equal(prepared.workspace, workspace)
    assert.match(readFileSync(join(workspace, '.benchmark-task.md'), 'utf8'), /savedPosition/)
    assert.equal(runGit(workspace, ['status', '--porcelain']).stdout, '')
    assert.notEqual(
      runGit(workspace, [
        'cat-file',
        '-e',
        '0f3eaa38fb91697b0a5422b1491387274ea6d54b^{commit}',
      ]).status,
      0,
    )
    assert.equal(
      runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']).stdout,
      statusBefore,
    )
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}, 60_000)

test('evaluate injects oracle tests into a disposable copy and scores an unsolved baseline', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-evaluate-'))
  const workspace = join(temporaryRoot, 'candidate')
  const resultsDirectory = join(temporaryRoot, 'results')

  try {
    const prepared = runCli([
      'prepare',
      'hash-scroll-restoration',
      '--workspace',
      workspace,
      '--json',
    ])
    assert.equal(prepared.status, 0, prepared.stderr)

    const evaluated = runCli([
      'evaluate',
      'hash-scroll-restoration',
      '--workspace',
      workspace,
      '--db',
      join(temporaryRoot, 'benchmark.sqlite3'),
      '--results',
      resultsDirectory,
      '--json',
    ])

    assert.equal(evaluated.status, 0, evaluated.stderr)
    const report = JSON.parse(evaluated.stdout) as {
      caseId: string
      maxScore: number
      score: number
      checks: Array<{
        id: string
        passed: boolean
        detailsHidden: boolean
        command?: string[]
        output?: string
      }>
      scoring: {
        changedFiles: {
          f1: number
          missing?: string[]
          extra?: string[]
        }
      }
      reportFile: string
    }
    assert.equal(report.caseId, 'hash-scroll-restoration')
    assert.equal(report.maxScore, 100)
    assert.ok(report.score < report.maxScore)
    assert.equal(report.checks.find(check => check.id === 'behavior')?.passed, false)
    assert.ok(report.checks.every(check => check.detailsHidden))
    assert.ok(report.checks.every(check => check.command === undefined))
    assert.ok(report.checks.every(check => check.output === undefined))
    assert.equal(report.scoring.changedFiles.f1, 0)
    assert.equal(report.scoring.changedFiles.missing, undefined)
    assert.equal(report.scoring.changedFiles.extra, undefined)
    assert.ok(readFileSync(report.reportFile, 'utf8').includes('"caseId": "hash-scroll-restoration"'))
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}, 120_000)

test('evaluate rejects candidate symlinks before injecting oracle files', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-symlink-'))
  const workspace = join(temporaryRoot, 'candidate')
  const sourcePackageBefore = readFileSync(join(repoRoot, 'package.json'), 'utf8')

  try {
    const prepared = runCli([
      'prepare',
      'hash-scroll-restoration',
      '--workspace',
      workspace,
      '--json',
    ])
    assert.equal(prepared.status, 0, prepared.stderr)
    symlinkSync(join(repoRoot, 'package.json'), join(workspace, 'src', 'benchmark-leak.ts'))

    const evaluated = runCli([
      'evaluate',
      'hash-scroll-restoration',
      '--workspace',
      workspace,
      '--db',
      join(temporaryRoot, 'benchmark.sqlite3'),
      '--results',
      join(temporaryRoot, 'results'),
      '--json',
    ])

    assert.equal(evaluated.status, 2)
    assert.match(evaluated.stderr, /Candidate symlinks are not allowed/)
    assert.equal(readFileSync(join(repoRoot, 'package.json'), 'utf8'), sourcePackageBefore)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}, 60_000)

test('validate --run-gold proves the oracle rejects baseline and accepts reference', () => {
  const result = runCli([
    'validate',
    'full-essay-search',
    '--run-gold',
    '--json',
  ])

  assert.equal(result.status, 0, result.stderr)
  const validation = JSON.parse(result.stdout) as {
    valid: boolean
    baseline: Array<{ caseId: string; checks: Array<{ passed: boolean }> }>
    gold: Array<{ caseId: string; score: number; checks: Array<{ passed: boolean }> }>
    harnessBaseline: Array<{ caseId: string; checks: Array<{ passed: boolean }> }>
    harnessGold: Array<{ caseId: string; score: number; checks: Array<{ passed: boolean }> }>
  }
  assert.equal(validation.valid, true)
  assert.equal(validation.baseline.length, 1)
  assert.equal(validation.baseline[0]?.caseId, 'full-essay-search')
  assert.ok(validation.baseline[0]?.checks.some(check => !check.passed))
  assert.equal(validation.gold.length, 1)
  assert.equal(validation.gold[0]?.caseId, 'full-essay-search')
  assert.equal(validation.gold[0]?.score, 100)
  assert.ok(validation.gold[0]?.checks.every(check => check.passed))
  assert.equal(validation.harnessBaseline.length, 1)
  assert.ok(validation.harnessBaseline[0]?.checks.some(check => !check.passed))
  assert.equal(validation.harnessGold.length, 1)
  assert.equal(validation.harnessGold[0]?.score, 100)
  assert.ok(validation.harnessGold[0]?.checks.every(check => check.passed))
}, 120_000)
