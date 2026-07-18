import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export function loadManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

export function sortedCases(manifest) {
  return manifest.cases.toSorted((left, right) => left.rank - right.rank)
}

function git(repoRoot, args) {
  return spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
}

function gitOutput(repoRoot, args) {
  const result = git(repoRoot, args)
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  }
  return result.stdout.trim()
}

function commitExists(repoRoot, commit) {
  return git(repoRoot, ['cat-file', '-e', `${commit}^{commit}`]).status === 0
}

function fileExistsAtCommit(repoRoot, commit, file) {
  return git(repoRoot, ['cat-file', '-e', `${commit}:${file}`]).status === 0
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

function validateHarnessSource(repoRoot, file) {
  if (!pathIsContained(repoRoot, file.source)) return 'harness source escapes repository'
  const sourcePath = resolve(repoRoot, file.source)
  try {
    const stat = lstatSync(sourcePath)
    if (!stat.isFile() || stat.isSymbolicLink()) return 'harness source must be a regular file'
    if (!pathIsContained(repoRoot, relative(repoRoot, realpathSync(sourcePath)))) {
      return 'harness source resolves outside repository'
    }
    if (git(repoRoot, ['ls-files', '--error-unmatch', '--', file.source]).status !== 0) {
      return 'harness source must be tracked by git'
    }
    if (!/^[0-9a-f]{64}$/.test(file.sha256 ?? '')) return 'invalid harness checksum'
    if (sha256(readFileSync(sourcePath)) !== file.sha256) return 'harness checksum mismatch'
    return null
  } catch {
    return 'harness source file is missing'
  }
}

function readDiffStats(repoRoot, baseCommit, referenceCommit) {
  const names = gitOutput(repoRoot, [
    'diff',
    '--name-only',
    '-z',
    baseCommit,
    referenceCommit,
    '--',
  ])
  const numstat = gitOutput(repoRoot, [
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

export function validateManifest(manifest, repoRoot) {
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
      const validSource = isSafeRelativeFile(file?.source)
        && file.source.startsWith('agent-benchmark/oracles/')
      const validDestination = isSafeRelativeFile(file?.destination)
        && file.destination.startsWith('tests/benchmark-oracle/')
      if (!validSource || !validDestination) {
        errors.push(`${prefix}: invalid harness file mapping`)
        continue
      }
      const sourceError = validateHarnessSource(repoRoot, file)
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
      if (!commitExists(repoRoot, benchmarkCase.referenceCommit)) {
        throw new Error('reference commit does not exist')
      }
      if (!commitExists(repoRoot, benchmarkCase.baseCommit)) {
        throw new Error('base commit does not exist')
      }

      const parentLine = gitOutput(repoRoot, [
        'rev-list',
        '--parents',
        '-n',
        '1',
        benchmarkCase.referenceCommit,
      ])
      const [, ...parents] = parentLine.split(/\s+/)
      parentMatches = parents.length === 1 && parents[0] === benchmarkCase.baseCommit
      if (!parentMatches) errors.push(`${prefix}: baseCommit is not the reference commit's sole parent`)

      onSourceRef = git(repoRoot, [
        'merge-base',
        '--is-ancestor',
        benchmarkCase.referenceCommit,
        manifest.sourceRef,
      ]).status === 0
      if (!onSourceRef) errors.push(`${prefix}: reference commit is not on ${manifest.sourceRef}`)

      const sourceCommit = benchmarkCase.oracleCommit ?? benchmarkCase.referenceCommit
      if (!SHA_PATTERN.test(sourceCommit)) throw new Error('oracle commit must be a full lowercase SHA')
      if (!commitExists(repoRoot, sourceCommit)) throw new Error('oracle commit does not exist')
      const oracleOnSourceRef = git(repoRoot, [
        'merge-base',
        '--is-ancestor',
        sourceCommit,
        manifest.sourceRef,
      ]).status === 0
      const oracleFollowsReference = git(repoRoot, [
        'merge-base',
        '--is-ancestor',
        benchmarkCase.referenceCommit,
        sourceCommit,
      ]).status === 0
      if (!oracleOnSourceRef || !oracleFollowsReference) {
        throw new Error('oracle commit must follow the reference commit on sourceRef')
      }
      oracleFilesPresent = files.every(file => fileExistsAtCommit(repoRoot, sourceCommit, file))
        && ['tsconfig.json', 'vite.config.ts'].every(file =>
          fileExistsAtCommit(repoRoot, benchmarkCase.baseCommit, file))
      if (!oracleFilesPresent) errors.push(`${prefix}: one or more oracle files are missing`)

      const actualStats = readDiffStats(repoRoot, benchmarkCase.baseCommit, benchmarkCase.referenceCommit)
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
