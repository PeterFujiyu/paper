import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { test } from 'vitest'

// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import { loadManifest } from '../../agent-benchmark/src/catalog.mjs'
// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import * as engineApi from '../../agent-benchmark/src/engine.mjs'
// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import { createPromptBundle } from '../../agent-benchmark/src/prompt.mjs'

const { candidateFingerprint, prepareCase, verifyLegacyWorkspace } = engineApi

const testCwd = process.cwd()
const repoRoot = basename(testCwd) === 'agent-benchmark' ? resolve(testCwd, '..') : testCwd
const manifest = loadManifest(join(repoRoot, 'agent-benchmark', 'benchmarks.json'))
const benchmarkCase = manifest.cases.find(
  (entry: { id: string }) => entry.id === 'hash-scroll-restoration',
)

test('v2 prepare writes the canonical prompt and a run-bound attestation', () => {
  assert.ok(benchmarkCase)
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-v2-prepare-'))
  const workspace = join(temporaryRoot, 'candidate')
  const runId = '0b388276-5b75-4e1d-bcc8-f1c4e78ac015'
  const prompt = createPromptBundle(benchmarkCase)

  try {
    const prepared = prepareCase({
      benchmarkCase,
      repoRoot,
      workspace,
      promptBundle: prompt,
      runId,
    })

    assert.equal(readFileSync(prepared.taskFile, 'utf8'), prompt.text)
    const session = JSON.parse(
      readFileSync(join(workspace, '.benchmark-session.json'), 'utf8'),
    ) as {
      schemaVersion: number
      runId: string
      caseId: string
      promptHash: string
      baselineTree: string
    }
    assert.equal(session.schemaVersion, 2)
    assert.equal(session.runId, runId)
    assert.equal(session.caseId, benchmarkCase.id)
    assert.equal(session.promptHash, prompt.sha256)
    assert.equal(session.baselineTree, prepared.baselineTree)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}, 30_000)

test('candidate fingerprint includes untracked file paths and bytes', () => {
  assert.ok(benchmarkCase)
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-v2-fingerprint-'))
  const workspace = join(temporaryRoot, 'candidate')

  try {
    prepareCase({ benchmarkCase, repoRoot, workspace })
    const baselineFingerprint = candidateFingerprint({
      benchmarkCase,
      repoRoot,
      workspace,
    })

    writeFileSync(join(workspace, 'candidate-note.txt'), 'first\n')
    const firstFingerprint = candidateFingerprint({
      benchmarkCase,
      repoRoot,
      workspace,
    })
    writeFileSync(join(workspace, 'candidate-note.txt'), 'second\n')
    const secondFingerprint = candidateFingerprint({
      benchmarkCase,
      repoRoot,
      workspace,
    })

    assert.notEqual(firstFingerprint, baselineFingerprint)
    assert.notEqual(secondFingerprint, firstFingerprint)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}, 30_000)

test('v2 workspaces cannot be downgraded to legacy ad-hoc evaluation', () => {
  assert.ok(benchmarkCase)
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-v2-legacy-'))
  const workspace = join(temporaryRoot, 'candidate')
  const prompt = createPromptBundle(benchmarkCase)

  try {
    prepareCase({
      benchmarkCase,
      repoRoot,
      workspace,
      promptBundle: prompt,
      runId: '0b388276-5b75-4e1d-bcc8-f1c4e78ac015',
    })
    assert.throws(
      () => verifyLegacyWorkspace({ benchmarkCase, repoRoot, workspace }),
      /v2 workspace.*Run ID/,
    )
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}, 30_000)

test('candidate fingerprint excludes force-added benchmark metadata', () => {
  assert.ok(benchmarkCase)
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-v2-metadata-'))
  const workspace = join(temporaryRoot, 'candidate')

  try {
    prepareCase({ benchmarkCase, repoRoot, workspace })
    const baselineFingerprint = candidateFingerprint({ benchmarkCase, repoRoot, workspace })
    writeFileSync(join(workspace, '.benchmark-task.md'), 'tampered task metadata\n')
    const sessionPath = join(workspace, '.benchmark-session.json')
    const session = JSON.parse(readFileSync(sessionPath, 'utf8')) as Record<string, unknown>
    writeFileSync(sessionPath, `${JSON.stringify({ ...session, tampered: true }, null, 2)}\n`)
    const added = spawnSync(
      'git',
      ['add', '-f', '.benchmark-task.md', '.benchmark-session.json'],
      { cwd: workspace, encoding: 'utf8' },
    )
    assert.equal(added.status, 0, added.stderr)

    assert.equal(
      candidateFingerprint({ benchmarkCase, repoRoot, workspace }),
      baselineFingerprint,
    )
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}, 30_000)
