import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { HARNESS_ROOT } from './paths.mjs'

export const SUBJECT_ENV_VAR = 'PAPER_BENCHMARK_SUBJECT'
export const LOCAL_CONFIG_FILE = '.benchmark.local.json'
export const CONFIG_FILE = 'benchmark.config.json'

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * What the subject *is* — provenance that belongs in git. Machine-specific absolute paths do not
 * go here; they go in `.benchmark.local.json`, which is ignored.
 */
export function loadSubjectConfig(harnessRoot = HARNESS_ROOT) {
  return readJson(join(harnessRoot, CONFIG_FILE)) ?? {}
}

/**
 * Where the subject *is*, in precedence order:
 *
 *   1. --subject <path>
 *   2. $PAPER_BENCHMARK_SUBJECT
 *   3. .benchmark.local.json   (gitignored)
 *   4. the harness's parent directory   <- Stage 1 only; Stage 2 deletes this branch
 *   5. fail with remediation
 *
 * Step 4 is what keeps this non-breaking while the harness is still nested inside `paper`. The
 * interactive TTY entry point takes no flags at all, which is why a flag-only design does not work.
 *
 * Auto-discovery (walking up looking for something that smells like the subject) is deliberately
 * absent: a mis-discovered root feeds `assertSafeNewWorkspace`, `assertSafeDatabasePath`, and
 * `cloneDependencies`, so `git archive` and `cp` would run against the wrong tree with every
 * containment guard silently anchored to it.
 */
export function resolveSubjectRoot({
  subjectFlag,
  env = process.env,
  harnessRoot = HARNESS_ROOT,
  allowNestedFallback = true,
} = {}) {
  if (subjectFlag) return { path: resolve(subjectFlag), source: '--subject' }

  const fromEnv = env[SUBJECT_ENV_VAR]
  if (fromEnv) return { path: resolve(fromEnv), source: `$${SUBJECT_ENV_VAR}` }

  const local = readJson(join(harnessRoot, LOCAL_CONFIG_FILE))
  if (local?.subject?.path) {
    return { path: resolve(harnessRoot, local.subject.path), source: LOCAL_CONFIG_FILE }
  }

  if (allowNestedFallback) {
    return { path: resolve(harnessRoot, '..'), source: 'nested layout' }
  }

  const config = loadSubjectConfig(harnessRoot)
  const remote = config.subject?.remote ?? '<subject remote>'
  throw new Error(
    'Cannot locate the benchmark subject repository.\n\n'
    + 'Set one of the following:\n'
    + '  --subject /path/to/paper\n'
    + `  ${SUBJECT_ENV_VAR}=/path/to/paper\n`
    + `  ${LOCAL_CONFIG_FILE}  ->  { "subject": { "path": "/path/to/paper" } }\n\n`
    + `The subject is ${remote} at ${config.subject?.ref ?? 'main'}.\n`
    + 'Clone it with tags (git clone, or git fetch --tags in an existing checkout) and run npm ci\n'
    + 'inside it before running the benchmark.',
  )
}

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
}

/**
 * Fail fast, with remediation, before any of this surfaces as a confusing error deep inside
 * manifest validation or as a raw "Source node_modules is missing" from the evaluator.
 *
 * @param probeCommit          a commit the subject must contain — cheap proof it is the right repo
 * @param requireDependencies  only the commands that execute the subject's toolchain need its
 *                             node_modules; `validate` and `doctor` deliberately do not
 */
export function assertUsableSubject(subjectRoot, { probeCommit, requireDependencies = true } = {}) {
  const where = `${subjectRoot}`

  if (!existsSync(subjectRoot)) {
    throw new Error(`Subject repository does not exist: ${where}`)
  }

  const worktree = git(subjectRoot, ['rev-parse', '--is-inside-work-tree'])
  if (worktree.status !== 0 || worktree.stdout.trim() !== 'true') {
    throw new Error(
      `Subject is not a Git work tree: ${where}\n`
      + 'A bare or mirror clone cannot be used — the harness needs a checked-out tree.',
    )
  }

  if (probeCommit) {
    const found = git(subjectRoot, ['cat-file', '-e', `${probeCommit}^{commit}`])
    if (found.status !== 0) {
      throw new Error(
        `Subject repository does not contain the benchmark's pinned history: ${where}\n`
        + `Commit ${probeCommit} is missing. Wrong repository, or a shallow clone —\n`
        + 'the harness needs full history (git fetch --unshallow).',
      )
    }
  }

  if (requireDependencies && !existsSync(join(subjectRoot, 'node_modules'))) {
    throw new Error(
      `Subject dependencies are not installed: ${join(where, 'node_modules')}\n`
      + 'Run npm ci inside the subject repository — checks execute its vitest/vue-tsc/vite.',
    )
  }

  return subjectRoot
}
