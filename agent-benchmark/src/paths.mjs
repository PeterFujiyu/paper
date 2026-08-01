import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The repository the harness itself lives in.
 *
 * `repoRoot` used to mean four different things at once: where the benchmark's git history comes
 * from, where npm dependencies are borrowed from, where grading rules are trusted from, and where
 * runtime state is written. The first two belong to the repository under test; the last two belong
 * to the harness. This constant is the second root.
 *
 * It is derived from this module's own location so the same expression is correct before and after
 * the extraction: today `src/paths.mjs` sits inside `paper/agent-benchmark/`, afterwards it sits
 * at the harness repository root. Never re-derive it from a user-supplied path — a mis-derived
 * trust anchor is what the containment guards exist to prevent.
 */
export const HARNESS_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Where the harness writes: the SQLite database, results, recovery spools, and candidate
 * workspaces. Harness-local, because a candidate workspace is a full copy of the repository under
 * test and materializing those back into that repository is exactly the pollution the extraction
 * removes.
 */
export function defaultRuntimeRoot(harnessRoot = HARNESS_ROOT) {
  return join(resolve(harnessRoot), '.agent-benchmark')
}

/**
 * Where candidate workspaces are materialized. Passed explicitly to `assertSafeDatabasePath` so
 * that guard checks the directory workspaces are really created in.
 */
export function workspacesRootFor(runtimeRoot = defaultRuntimeRoot()) {
  return join(resolve(runtimeRoot), 'workspaces')
}

/**
 * How to invoke this CLI, for messages the operator is meant to copy and run.
 *
 * Derived rather than hardcoded: `npm run benchmark -- …` is a script that exists in `paper` only
 * while the harness is nested, and in neither repository afterwards. Resolving against the actual
 * cwd prints `node agent-benchmark/cli.mjs` from paper's root today and `node cli.mjs` from the
 * harness root after the split.
 */
export function cliCommand(cwd = process.cwd()) {
  const cliPath = fileURLToPath(new URL('../cli.mjs', import.meta.url))
  const relativePath = relative(cwd, cliPath)
  return `node ${relativePath && !relativePath.startsWith('..') ? relativePath : cliPath}`
}
