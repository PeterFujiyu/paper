import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'

// @ts-expect-error -- benchmark CLI modules are intentionally native ESM JavaScript
import * as databasePathApi from '../../agent-benchmark/src/database-path.mjs'

const { assertSafeDatabasePath } = databasePathApi

test('database path rejects source Git and candidate workspace equivalents', () => {
  const root = mkdtempSync(join(tmpdir(), 'paper-benchmark-db-path-'))
  const source = join(root, 'source')
  const gitDirectory = join(source, '.git')
  const workspace = join(root, 'candidate')
  mkdirSync(gitDirectory, { recursive: true })
  mkdirSync(workspace)
  writeFileSync(join(workspace, '.benchmark-session.json'), '{}\n')
  const workspaceAlias = join(root, 'candidate-alias')
  symlinkSync(workspace, workspaceAlias, 'dir')

  try {
    assert.equal(
      assertSafeDatabasePath({
        databasePath: join(source, '.agent-benchmark', 'benchmark.sqlite3'),
        repoRoot: source,
      }),
      join(realpathSync(source), '.agent-benchmark', 'benchmark.sqlite3'),
    )
    assert.throws(() => assertSafeDatabasePath({
      databasePath: join(gitDirectory, 'benchmark.sqlite3'),
      repoRoot: source,
    }), /\.git/)
    assert.throws(() => assertSafeDatabasePath({
      databasePath: join(workspaceAlias, 'benchmark.sqlite3'),
      repoRoot: source,
      candidateWorkspaces: [workspace],
    }), /workspace/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
