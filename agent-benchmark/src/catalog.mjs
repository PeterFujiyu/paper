import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { HARNESS_ROOT } from './paths.mjs'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export function loadManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

export function sortedCases(manifest) {
  return manifest.cases.toSorted((left, right) => left.rank - right.rank)
}

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
}

function gitOutput(root, args) {
  const result = git(root, args)
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  }
  return result.stdout.trim()
}

function commitExists(root, commit) {
  return git(root, ['cat-file', '-e', `${commit}^{commit}`]).status === 0
}

function fileExistsAtCommit(root, commit, file) {
  return git(root, ['cat-file', '-e', `${commit}:${file}`]).status === 0
}

const TAG_PATTERN = /^benchmark\/[a-z0-9][a-z0-9-]*\/(?:base|ref|oracle)$/

/**
 * Resolve a pinned tag in the subject repository and confirm it names the expected commit.
 *
 * Returns null when it holds, or a human-readable reason. `git clone` fetches tags by default but
 * `--single-branch` and several CI checkout actions do not, so a missing tag is called out
 * separately with its remediation — otherwise it surfaces as a baffling validation failure.
 */
function checkTag(root, tag, expectedCommit) {
  if (!TAG_PATTERN.test(tag ?? '')) return `tag is missing or malformed in the manifest: ${tag ?? '(none)'}`
  const resolved = git(root, ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`])
  if (resolved.status !== 0) {
    return `tag ${tag} does not exist in the subject repository — run: git -C <subject> fetch --tags`
  }
  const actual = resolved.stdout.trim()
  if (actual !== expectedCommit) {
    return `tag ${tag} points at ${actual}, but the manifest pins ${expectedCommit}`
  }
  return null
}

function isSafeRelativeFile(file) {
  const normalized = typeof file === 'string' ? file.replaceAll('\\', '/') : ''
  return typeof file === 'string'
    && file.length > 0
    && !file.includes('\0')
    && !normalized.startsWith('/')
    && !/^[a-z]:/i.test(normalized)
    && !normalized.split('/').includes('..')
}

function pathIsContained(root, file) {
  const target = resolve(root, file)
  const path = relative(resolve(root), target)
  return path.length > 0
    && path !== '..'
    && !path.startsWith(`..${sep}`)
    && !isAbsolute(path)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Verify one grading-rule file against the harness repository.
 *
 * Every check is anchored to `harnessRoot`, never to the repository under test — asking the
 * subject repo to vouch for the rule that grades it would defeat the point. Post-extraction the
 * manifest, the recorded checksums, and the oracle bytes all live in this one repo, which makes
 * cross-repo skew structurally impossible.
 */
export function validateHarnessSource(harnessRoot, file) {
  if (!pathIsContained(harnessRoot, file.source)) return 'harness source escapes repository'
  const sourcePath = resolve(harnessRoot, file.source)
  try {
    const stat = lstatSync(sourcePath)
    if (!stat.isFile() || stat.isSymbolicLink()) return 'harness source must be a regular file'
    if (!pathIsContained(harnessRoot, relative(harnessRoot, realpathSync(sourcePath)))) {
      return 'harness source resolves outside repository'
    }
    if (git(harnessRoot, ['ls-files', '--error-unmatch', '--', file.source]).status !== 0) {
      return 'harness source must be tracked by git'
    }
    if (!/^[0-9a-f]{64}$/.test(file.sha256 ?? '')) return 'invalid harness checksum'
    if (sha256(readFileSync(sourcePath)) !== file.sha256) return 'harness checksum mismatch'
    // `ls-files` checks the index, so a tracked file with uncommitted edits would otherwise pass
    // both guards above: edit the oracle, recompute the hash, paste it into the manifest, done.
    // Comparing against HEAD is what makes the checksum a real anti-drift guarantee. The `./`
    // prefix keeps the pathspec cwd-relative, so it resolves in both the nested and split layouts.
    const committed = spawnSync('git', ['-C', harnessRoot, 'show', `HEAD:./${file.source}`], {
      encoding: null,
      maxBuffer: 10 * 1024 * 1024,
    })
    if (committed.status !== 0) return 'harness source is not committed at HEAD'
    if (sha256(committed.stdout) !== file.sha256) return 'harness source differs from HEAD'
    return null
  } catch {
    return 'harness source file is missing'
  }
}

function readDiffStats(root, baseCommit, referenceCommit) {
  const names = gitOutput(root, [
    'diff',
    '--name-only',
    '-z',
    baseCommit,
    referenceCommit,
    '--',
  ])
  const numstat = gitOutput(root, [
    'diff',
    '--numstat',
    baseCommit,
    referenceCommit,
    '--',
  ])

  let insertions = 0
  let deletions = 0
  for (const line of numstat.split('\n')) {
    if (!line) continue
    const [added, removed] = line.split('\t')
    if (added !== '-') insertions += Number(added)
    if (removed !== '-') deletions += Number(removed)
  }

  return {
    files: names ? names.split('\0').filter(Boolean).length : 0,
    insertions,
    deletions,
  }
}

function sameStats(actual, expected) {
  return actual.files === expected?.files
    && actual.insertions === expected?.insertions
    && actual.deletions === expected?.deletions
}

function oracleFiles(benchmarkCase) {
  const harnessFiles = Array.isArray(benchmarkCase.harnessFiles)
    ? benchmarkCase.harnessFiles
    : []
  const harnessPaths = new Set(
    harnessFiles.map(file => file.destination),
  )
  const vitestChecks = (benchmarkCase.checks ?? [])
    .filter(check => check.kind === 'vitest')
  const testFiles = vitestChecks
    .flatMap(check => check.files ?? [])
    .filter(file => !harnessPaths.has(file))
  const controlFiles = vitestChecks.length > 0 ? ['tests/setup.ts', 'vitest.config.ts'] : []
  return [...new Set([
    ...testFiles,
    ...controlFiles,
    ...(benchmarkCase.oracleSupportFiles ?? []),
  ])]
}

function validateChecks(benchmarkCase, prefix, errors) {
  if (!Array.isArray(benchmarkCase.checks) || benchmarkCase.checks.length === 0) {
    errors.push(`${prefix}: checks are required`)
    return
  }

  const ids = new Set()
  for (const check of benchmarkCase.checks) {
    if (!ID_PATTERN.test(check.id ?? '')) errors.push(`${prefix}: invalid check id`)
    if (ids.has(check.id)) errors.push(`${prefix}: duplicate check id ${check.id}`)
    ids.add(check.id)
    if (!['vitest', 'npm-script'].includes(check.kind)) {
      errors.push(`${prefix}: unsupported check kind ${check.kind}`)
    }
    if (!Number.isInteger(check.points) || check.points <= 0) {
      errors.push(`${prefix}: check points must be positive integers`)
    }
    if (!Number.isInteger(check.timeoutMs) || check.timeoutMs < 1000 || check.timeoutMs > 600000) {
      errors.push(`${prefix}: check timeout must be between 1s and 10m`)
    }
    if (check.kind === 'vitest' && (!Array.isArray(check.files) || check.files.length === 0)) {
      errors.push(`${prefix}: vitest checks require files`)
    }
    if (check.kind === 'vitest' && !check.files?.every(isSafeRelativeFile)) {
      errors.push(`${prefix}: vitest paths must be safe relative files`)
    }
    if (check.kind === 'npm-script' && !['typecheck', 'build'].includes(check.script)) {
      errors.push(`${prefix}: unsupported npm script ${check.script}`)
    }
  }
}

/**
 * @param manifest       the parsed benchmarks.json
 * @param subjectRoot    the repository under test — source of commits, diffs, and oracle content
 * @param harnessRoot    the repository holding the grading rules; defaults to this harness
 */
export function validateManifest(manifest, subjectRoot, harnessRoot = HARNESS_ROOT) {
  const errors = []
  const caseResults = []

  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (!Array.isArray(manifest.cases)) {
    return { valid: false, caseCount: 0, errors: [...errors, 'cases must be an array'], cases: [] }
  }
  if (manifest.cases.length !== 10) errors.push('manifest must contain exactly 10 cases')

  const ids = new Set()
  const references = new Set()
  const expectedRanks = Array.from({ length: manifest.cases.length }, (_, index) => index + 1)
  const actualRanks = sortedCases(manifest).map(benchmarkCase => benchmarkCase.rank)
  if (JSON.stringify(actualRanks) !== JSON.stringify(expectedRanks)) {
    errors.push('case ranks must be contiguous from 1')
  }

  for (const benchmarkCase of manifest.cases) {
    const prefix = benchmarkCase.id || `rank-${benchmarkCase.rank}`
    if (!ID_PATTERN.test(benchmarkCase.id ?? '')) errors.push(`${prefix}: invalid id`)
    if (ids.has(benchmarkCase.id)) errors.push(`${prefix}: duplicate id`)
    ids.add(benchmarkCase.id)

    if (!SHA_PATTERN.test(benchmarkCase.referenceCommit ?? '')) {
      errors.push(`${prefix}: referenceCommit must be a full lowercase SHA`)
    }
    if (!SHA_PATTERN.test(benchmarkCase.baseCommit ?? '')) {
      errors.push(`${prefix}: baseCommit must be a full lowercase SHA`)
    }
    if (references.has(benchmarkCase.referenceCommit)) errors.push(`${prefix}: duplicate referenceCommit`)
    references.add(benchmarkCase.referenceCommit)

    if (typeof benchmarkCase.prompt !== 'string' || benchmarkCase.prompt.length < 100) {
      errors.push(`${prefix}: prompt must contain at least 100 characters`)
    }
    if (!Array.isArray(benchmarkCase.acceptanceCriteria) || benchmarkCase.acceptanceCriteria.length < 3) {
      errors.push(`${prefix}: at least 3 acceptance criteria are required`)
    }
    validateChecks(benchmarkCase, prefix, errors)

    const points = (benchmarkCase.checks ?? []).reduce((total, check) => total + check.points, 0)
    if (points !== 100) errors.push(`${prefix}: check points must total 100`)

    const files = oracleFiles(benchmarkCase)
    if (!files.every(isSafeRelativeFile)) errors.push(`${prefix}: oracle paths must be safe relative files`)
    if (benchmarkCase.harnessFiles !== undefined && !Array.isArray(benchmarkCase.harnessFiles)) {
      errors.push(`${prefix}: harnessFiles must be an array`)
    }
    const harnessFiles = Array.isArray(benchmarkCase.harnessFiles)
      ? benchmarkCase.harnessFiles
      : []
    const harnessDestinations = new Set()
    for (const file of harnessFiles) {
      // Resolved against harnessRoot, so this prefix is already in its post-split form. It must
      // change in lockstep with benchmarks.json's harnessFiles[].source values.
      const validSource = isSafeRelativeFile(file?.source)
        && file.source.startsWith('oracles/')
      const validDestination = isSafeRelativeFile(file?.destination)
        && file.destination.startsWith('tests/benchmark-oracle/')
      if (!validSource || !validDestination) {
        errors.push(`${prefix}: invalid harness file mapping`)
        continue
      }
      const sourceError = validateHarnessSource(harnessRoot, file)
      if (sourceError) errors.push(`${prefix}: ${sourceError}`)
      if (harnessDestinations.has(file.destination)) {
        errors.push(`${prefix}: duplicate harness destination`)
      }
      harnessDestinations.add(file.destination)
      const referenced = (benchmarkCase.checks ?? []).some(check =>
        check.kind === 'vitest' && check.files?.includes(file.destination))
      if (!referenced) errors.push(`${prefix}: harness file is not referenced by a vitest check`)
    }

    let parentMatches = false
    let onSourceRef = false
    let oracleFilesPresent = false
    let statsMatches = false
    try {
      if (!commitExists(subjectRoot, benchmarkCase.referenceCommit)) {
        throw new Error('reference commit does not exist')
      }
      if (!commitExists(subjectRoot, benchmarkCase.baseCommit)) {
        throw new Error('base commit does not exist')
      }

      const parentLine = gitOutput(subjectRoot, [
        'rev-list',
        '--parents',
        '-n',
        '1',
        benchmarkCase.referenceCommit,
      ])
      const [, ...parents] = parentLine.split(/\s+/)
      parentMatches = parents.length === 1 && parents[0] === benchmarkCase.baseCommit
      if (!parentMatches) errors.push(`${prefix}: baseCommit is not the reference commit's sole parent`)

      // Tag identity, not reachability from a mutable branch. Reachability from `main` breaks the
      // moment the subject is rebased, and does nothing to stop a force-push plus GC from making
      // the pinned commits unreachable entirely. A tag both keeps the object alive and proves it
      // still points where the manifest says.
      const baseTagError = checkTag(subjectRoot, benchmarkCase.baseTag, benchmarkCase.baseCommit)
      if (baseTagError) errors.push(`${prefix}: base ${baseTagError}`)

      const referenceTagError = checkTag(
        subjectRoot,
        benchmarkCase.referenceTag,
        benchmarkCase.referenceCommit,
      )
      if (referenceTagError) errors.push(`${prefix}: reference ${referenceTagError}`)
      onSourceRef = !baseTagError && !referenceTagError

      const sourceCommit = benchmarkCase.oracleCommit ?? benchmarkCase.referenceCommit
      if (!SHA_PATTERN.test(sourceCommit)) throw new Error('oracle commit must be a full lowercase SHA')
      if (!commitExists(subjectRoot, sourceCommit)) throw new Error('oracle commit does not exist')
      if (benchmarkCase.oracleCommit) {
        const oracleTagError = checkTag(subjectRoot, benchmarkCase.oracleTag, sourceCommit)
        if (oracleTagError) errors.push(`${prefix}: oracle ${oracleTagError}`)
      }
      // Kept as-is: unlike the reachability checks this is a genuine semantic invariant — the
      // oracle must describe the state of the world at or after the reference commit.
      const oracleFollowsReference = git(subjectRoot, [
        'merge-base',
        '--is-ancestor',
        benchmarkCase.referenceCommit,
        sourceCommit,
      ]).status === 0
      if (!oracleFollowsReference) {
        throw new Error('oracle commit must follow the reference commit')
      }
      oracleFilesPresent = files.every(file => fileExistsAtCommit(subjectRoot, sourceCommit, file))
        && ['tsconfig.json', 'vite.config.ts'].every(file =>
          fileExistsAtCommit(subjectRoot, benchmarkCase.baseCommit, file))
      if (!oracleFilesPresent) errors.push(`${prefix}: one or more oracle files are missing`)

      const actualStats = readDiffStats(subjectRoot, benchmarkCase.baseCommit, benchmarkCase.referenceCommit)
      statsMatches = sameStats(actualStats, benchmarkCase.stats)
      if (!statsMatches) errors.push(`${prefix}: recorded diff stats do not match git`)
    } catch (error) {
      errors.push(`${prefix}: ${error instanceof Error ? error.message : String(error)}`)
    }

    caseResults.push({
      id: benchmarkCase.id,
      parentMatches,
      onSourceRef,
      oracleFilesPresent,
      statsMatches,
    })
  }

  return {
    valid: errors.length === 0,
    caseCount: manifest.cases.length,
    errors,
    cases: caseResults,
  }
}
