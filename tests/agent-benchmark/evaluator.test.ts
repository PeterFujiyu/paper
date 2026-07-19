import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'

// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import * as evaluatorApi from '../../agent-benchmark/src/evaluator.mjs'

const { evaluateCaseInSubprocess } = evaluatorApi

test('subprocess evaluator returns a report without coupling it to artifact writes', async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-evaluator-report-'))
  const workerPath = join(temporaryRoot, 'worker.mjs')
  writeFileSync(workerPath, `
process.stdin.resume()
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({
    ok: true,
    report: { caseId: 'fixture', score: 42, checks: [] },
  }))
})
`)

  try {
    const report = await evaluateCaseInSubprocess(
      { benchmarkCase: { id: 'fixture' } },
      { workerPath },
    ) as {
      caseId: string
      score: number
      checks: unknown[]
      reportFile?: string
    }
    assert.deepEqual(report, { caseId: 'fixture', score: 42, checks: [] })
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('subprocess evaluator can be interrupted and terminates promptly', async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-evaluator-cancel-'))
  const workerPath = join(temporaryRoot, 'worker.mjs')
  writeFileSync(workerPath, `
process.stdin.resume()
setInterval(() => {}, 1000)
`)
  const controller = new AbortController()
  let heartbeatCount = 0

  try {
    const evaluation = evaluateCaseInSubprocess(
      { benchmarkCase: { id: 'fixture' } },
      {
        workerPath,
        signal: controller.signal,
        heartbeatIntervalMs: 10,
        onHeartbeat: () => {
          heartbeatCount += 1
        },
        terminationGraceMs: 50,
      },
    )
    setTimeout(() => controller.abort(), 40)
    await assert.rejects(
      evaluation,
      (error: unknown) => error instanceof Error
        && 'code' in error
        && error.code === 'EVALUATION_INTERRUPTED',
    )
    assert.ok(heartbeatCount > 0)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
