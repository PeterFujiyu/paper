import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'

// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import * as recoveryApi from '../../agent-benchmark/src/recovery.mjs'

const {
  consumeEvaluationSpool,
  listEvaluationSpools,
  readEvaluationSpool,
  writeEvaluationSpool,
} = recoveryApi

test('evaluation recovery spool is atomic, checksummed, and consumable', () => {
  const runtimeRoot = mkdtempSync(join(tmpdir(), 'paper-benchmark-recovery-'))

  try {
    const path = writeEvaluationSpool({
      runtimeRoot,
      evaluationId: '85f40bcb-94bd-4054-ae1e-e30587bbbc37',
      runId: '0b388276-5b75-4e1d-bcc8-f1c4e78ac015',
      candidateFingerprint: 'a'.repeat(64),
      createdAt: '2026-07-19T00:00:00.000Z',
      postExposure: false,
      exposureTypes: ['check_output'],
      report: {
        caseId: 'hash-scroll-restoration',
        score: 28.8,
        maxScore: 100,
        checks: [],
      },
    })

    assert.ok(existsSync(path))
    assert.deepEqual(listEvaluationSpools(runtimeRoot), [path])
    const spool = readEvaluationSpool(path)
    assert.equal(spool.schemaVersion, 1)
    assert.equal(spool.evaluationId, '85f40bcb-94bd-4054-ae1e-e30587bbbc37')
    assert.equal(spool.postExposure, false)
    assert.deepEqual(spool.exposureTypes, ['check_output'])
    assert.match(spool.checksum, /^[0-9a-f]{64}$/)

    consumeEvaluationSpool(path)
    assert.equal(existsSync(path), false)
  } finally {
    rmSync(runtimeRoot, { recursive: true, force: true })
  }
})
