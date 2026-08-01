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

test('database path rejects the harness Git directory and the real workspaces root', () => {
  const root = mkdtempSync(join(tmpdir(), 'paper-benchmark-db-path-harness-'))
  const source = join(root, 'source')
  const harness = join(root, 'harness')
  const workspacesRoot = join(harness, '.agent-benchmark', 'workspaces')
  mkdirSync(join(source, '.git'), { recursive: true })
  mkdirSync(join(harness, '.git'), { recursive: true })
  mkdirSync(workspacesRoot, { recursive: true })

  try {
    // The harness repository is a separate checkout after the split; its .git must be off limits
    // too, not just the subject's.
    assert.throws(() => assertSafeDatabasePath({
      databasePath: join(harness, '.git', 'benchmark.sqlite3'),
      repoRoot: source,
      harnessRoot: harness,
    }), /\.git/)

    // Guard 2 must fire on the directory workspaces are actually created in, before any workspace
    // exists — that window is exactly what the prepared-workspace guard cannot cover.
    assert.throws(() => assertSafeDatabasePath({
      databasePath: join(workspacesRoot, 'some-case', 'benchmark.sqlite3'),
      repoRoot: source,
      harnessRoot: harness,
      workspacesRoot,
    }), /workspace/)

    // Beside the workspaces directory, not inside it — still allowed.
    assert.equal(
      assertSafeDatabasePath({
        databasePath: join(harness, '.agent-benchmark', 'benchmark.sqlite3'),
        repoRoot: source,
        harnessRoot: harness,
        workspacesRoot,
      }),
      join(realpathSync(harness), '.agent-benchmark', 'benchmark.sqlite3'),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
