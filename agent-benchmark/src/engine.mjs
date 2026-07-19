import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeout,
  })
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `${command} exited with ${result.status}`
    throw new Error(detail)
  }
  return result.stdout.trim()
}

function git(cwd, args) {
  return run('git', args, { cwd })
}

function gitFile(repoRoot, commit, file) {
  const result = spawnSync('git', ['-C', repoRoot, 'show', `${commit}:${file}`], {
    encoding: null,
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString().trim() || `Cannot read ${file} from oracle commit`)
  }
  return result.stdout
}

function containedPath(root, file) {
  const base = resolve(root)
  const target = resolve(base, file)
  const path = relative(base, target)
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`Path escapes evaluation root: ${file}`)
  }
  return target
}

function assertSafeNewWorkspace(repoRoot, workspace) {
  const root = resolve(repoRoot)
  const target = resolve(workspace)
  const gitDirectory = join(root, '.git')

  if (target === root) throw new Error('Workspace cannot be the source repository')
  if (target === gitDirectory || target.startsWith(`${gitDirectory}${sep}`)) {
    throw new Error('Workspace cannot be inside the source .git directory')
  }
  if (existsSync(target)) throw new Error(`Workspace already exists: ${target}`)
  return target
}

function renderTask(benchmarkCase) {
  const criteria = benchmarkCase.acceptanceCriteria.map(item => `- ${item}`).join('\n')
  return `# Agent Benchmark Task\n\n` +
    `Case: ${benchmarkCase.id}\n` +
    `Difficulty: ${benchmarkCase.difficulty}\n` +
    `Suggested time: ${benchmarkCase.timeBudgetMinutes} minutes\n\n` +
    `## Task\n\n${benchmarkCase.prompt}\n\n` +
    `## Acceptance criteria\n\n${criteria}\n\n` +
    `Work only inside this repository. Do not inspect parent directories or external Git history.\n`
}

export function prepareCase({
  benchmarkCase,
  repoRoot,
  workspace,
  linkDependencies = false,
  promptBundle,
  runId,
}) {
  if ((promptBundle && !runId) || (!promptBundle && runId)) {
    throw new Error('A v2 workspace requires both promptBundle and runId')
  }
  if (promptBundle) {
    const actualPromptHash = createHash('sha256').update(promptBundle.text).digest('hex')
    if (actualPromptHash !== promptBundle.sha256) {
      throw new Error('Prompt bundle hash does not match its text')
    }
  }

  const target = assertSafeNewWorkspace(repoRoot, workspace)
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-agent-benchmark-prepare-'))
  const archive = join(temporaryRoot, 'base.tar')
  let workspaceCreated = false

  try {
    run('git', [
      '-C',
      repoRoot,
      'archive',
      '--format=tar',
      `--output=${archive}`,
      benchmarkCase.baseCommit,
    ])
    mkdirSync(target, { recursive: true })
    workspaceCreated = true
    run('tar', ['-xf', archive, '-C', target])

    git(target, ['init', '-q', '--initial-branch=benchmark'])
    git(target, ['config', 'user.name', 'Paper Agent Benchmark'])
    git(target, ['config', 'user.email', 'benchmark@localhost'])
    git(target, ['add', '-A'])
    git(target, ['commit', '-q', '-m', 'benchmark baseline'])

    const baselineTree = git(target, ['rev-parse', 'HEAD^{tree}'])
    const expectedTree = run('git', [
      '-C',
      repoRoot,
      'rev-parse',
      `${benchmarkCase.baseCommit}^{tree}`,
    ])
    if (baselineTree !== expectedTree) {
      throw new Error('Prepared snapshot tree does not match the benchmark base commit')
    }

    appendFileSync(
      join(target, '.git', 'info', 'exclude'),
      '\n.benchmark-task.md\n.benchmark-session.json\nnode_modules\n',
    )
    writeFileSync(
      join(target, '.benchmark-task.md'),
      promptBundle?.text ?? renderTask(benchmarkCase),
    )
    const session = promptBundle
      ? {
          schemaVersion: 2,
          runId,
          caseId: benchmarkCase.id,
          baselineTree,
          promptHash: promptBundle.sha256,
          promptTemplateVersion: promptBundle.version,
          createdAt: new Date().toISOString(),
        }
      : {
          schemaVersion: 1,
          caseId: benchmarkCase.id,
          baselineTree,
          createdAt: new Date().toISOString(),
        }
    writeFileSync(
      join(target, '.benchmark-session.json'),
      `${JSON.stringify(session, null, 2)}\n`,
    )

    let dependenciesLinked = false
    const sourceDependencies = join(repoRoot, 'node_modules')
    if (linkDependencies && existsSync(sourceDependencies)) {
      symlinkSync(sourceDependencies, join(target, 'node_modules'), 'dir')
      dependenciesLinked = true
    }

    return {
      caseId: benchmarkCase.id,
      workspace: target,
      taskFile: join(target, '.benchmark-task.md'),
      dependenciesLinked,
      baselineTree,
      runId: runId ?? null,
      promptHash: promptBundle?.sha256 ?? null,
    }
  } catch (error) {
    if (workspaceCreated) rmSync(target, { recursive: true, force: true })
    throw error
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

export function defaultWorkspace(repoRoot, caseId) {
  return join(repoRoot, '.agent-benchmark', 'workspaces', caseId)
}

function assertPreparedWorkspace(benchmarkCase, repoRoot, workspace) {
  const target = resolve(workspace)
  const sessionPath = join(target, '.benchmark-session.json')
  if (!existsSync(sessionPath) || !existsSync(join(target, '.git'))) {
    throw new Error('Workspace was not created by agent-benchmark prepare')
  }

  const session = JSON.parse(readFileSync(sessionPath, 'utf8'))
  if (session.caseId !== benchmarkCase.id) {
    throw new Error(`Workspace belongs to ${session.caseId}, not ${benchmarkCase.id}`)
  }

  const roots = git(target, ['rev-list', '--max-parents=0', 'HEAD']).split('\n').filter(Boolean)
  if (roots.length !== 1) throw new Error('Workspace does not have a single benchmark baseline')

  const actualTree = git(target, ['rev-parse', `${roots[0]}^{tree}`])
  const expectedTree = run('git', [
    '-C',
    repoRoot,
    'rev-parse',
    `${benchmarkCase.baseCommit}^{tree}`,
  ])
  if (actualTree !== expectedTree || session.baselineTree !== expectedTree) {
    throw new Error('Workspace baseline does not match the selected benchmark case')
  }
  return { target, baselineCommit: roots[0], baselineTree: expectedTree }
}

export function verifyRunWorkspace({
  benchmarkCase,
  repoRoot,
  workspace,
  runId,
  promptHash,
}) {
  const prepared = assertPreparedWorkspace(benchmarkCase, repoRoot, workspace)
  const session = JSON.parse(
    readFileSync(join(prepared.target, '.benchmark-session.json'), 'utf8'),
  )
  if (session.schemaVersion !== 2) {
    throw new Error('Recorded Run requires a v2 workspace attestation')
  }
  if (session.runId !== runId) {
    throw new Error('Workspace attestation does not match the recorded Run')
  }
  if (session.promptHash !== promptHash) {
    throw new Error('Workspace Prompt hash does not match the recorded Run')
  }
  return prepared
}

export function verifyLegacyWorkspace({ benchmarkCase, repoRoot, workspace }) {
  const prepared = assertPreparedWorkspace(benchmarkCase, repoRoot, workspace)
  const session = JSON.parse(
    readFileSync(join(prepared.target, '.benchmark-session.json'), 'utf8'),
  )
  if (session.schemaVersion !== 1) {
    throw new Error('v2 workspace 必须使用关联的 Run ID 评价，不能降级为 ad-hoc')
  }
  return prepared
}

function copyCandidateWorkspace(workspace, destination) {
  const excluded = new Set([
    '.git',
    'node_modules',
    '.benchmark-task.md',
    '.benchmark-session.json',
  ])
  cpSync(workspace, destination, {
    recursive: true,
    filter(source) {
      const path = relative(workspace, source)
      if (!path) return true
      return !excluded.has(path.split(sep)[0])
    },
  })
}

function assertNoCandidateSymlinks(root, directory = root) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) {
      throw new Error(`Candidate symlinks are not allowed: ${relative(root, path)}`)
    }
    if (entry.isDirectory()) assertNoCandidateSymlinks(root, path)
  }
}

function cloneDependencies(source, destination) {
  const cloneArgs = process.platform === 'darwin'
    ? ['-cR', source, destination]
    : ['-a', '--reflink=auto', source, destination]
  const cloned = spawnSync('cp', cloneArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  if (cloned.status === 0) return 'copy-on-write'

  cpSync(source, destination, { recursive: true })
  return 'copy'
}

function harnessDestinations(benchmarkCase) {
  return new Set(
    (benchmarkCase.harnessFiles ?? []).map(file => file.destination),
  )
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function injectOracleFiles(benchmarkCase, repoRoot, evaluationRoot) {
  const sourceCommit = benchmarkCase.oracleCommit ?? benchmarkCase.referenceCommit
  const harnessFiles = benchmarkCase.harnessFiles ?? []
  const harnessPaths = harnessDestinations(benchmarkCase)
  const testFiles = benchmarkCase.checks
    .filter(check => check.kind === 'vitest')
    .flatMap(check => check.files)
    .filter(file => !harnessPaths.has(file))
  const oracleControlFiles = ['tests/setup.ts', 'vitest.config.ts']
  const oracleFiles = [...new Set([
    ...testFiles,
    ...oracleControlFiles,
    ...(benchmarkCase.oracleSupportFiles ?? []),
  ])]

  for (const file of oracleFiles) {
    const destination = containedPath(evaluationRoot, file)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, gitFile(repoRoot, sourceCommit, file))
  }

  for (const file of ['tsconfig.json', 'vite.config.ts']) {
    const destination = containedPath(evaluationRoot, file)
    writeFileSync(destination, gitFile(repoRoot, benchmarkCase.baseCommit, file))
  }

  for (const file of harnessFiles) {
    const destination = containedPath(evaluationRoot, file.destination)
    const sourcePath = containedPath(repoRoot, file.source)
    const sourceStat = lstatSync(sourcePath)
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new Error(`Harness source must be a regular file: ${file.source}`)
    }
    containedPath(repoRoot, realpathSync(sourcePath))
    const source = readFileSync(sourcePath)
    if (sha256(source) !== file.sha256) {
      throw new Error(`Harness checksum mismatch: ${file.source}`)
    }
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, source)
  }

  return [
    ...oracleFiles,
    'tsconfig.json',
    'vite.config.ts',
    ...harnessFiles.map(file => file.destination),
  ]
}

function checkEnvironment() {
  const names = [
    'PATH',
    'HOME',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SystemRoot',
    'ComSpec',
    'PATHEXT',
  ]
  const env = {}
  for (const name of names) {
    if (process.env[name]) env[name] = process.env[name]
  }
  return {
    ...env,
    CI: '1',
    NODE_ENV: 'test',
    NO_COLOR: '1',
    JWT_SECRET: 'benchmark-secret-that-is-at-least-32-characters',
  }
}

function commandForCheck(check, evaluationRoot) {
  if (check.kind === 'vitest') {
    return [
      process.execPath,
      join(evaluationRoot, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      ...check.files,
    ]
  }
  if (check.kind === 'npm-script' && check.script === 'typecheck') {
    return [
      process.execPath,
      join(evaluationRoot, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js'),
      '--noEmit',
      '--project',
      'tsconfig.json',
    ]
  }
  if (check.kind === 'npm-script' && check.script === 'build') {
    return [
      process.execPath,
      join(evaluationRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
      'build',
      '--config',
      'vite.config.ts',
    ]
  }
  throw new Error(`Unsupported check kind: ${check.kind}`)
}

function tail(value, limit = 12000) {
  if (!value) return ''
  return value.length <= limit ? value : `[output truncated]\n${value.slice(-limit)}`
}

function executeCheck(check, evaluationRoot) {
  const [command, ...args] = commandForCheck(check, evaluationRoot)
  const startedAt = Date.now()
  const detached = process.platform !== 'win32'
  const result = spawnSync(command, args, {
    cwd: evaluationRoot,
    detached,
    encoding: 'utf8',
    env: checkEnvironment(),
    maxBuffer: 20 * 1024 * 1024,
    timeout: check.timeoutMs,
  })
  if (detached && result.pid) {
    try {
      process.kill(-result.pid, 'SIGTERM')
    } catch {
      // The process group normally exits with the command; this also cleans up descendants.
    }
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()

  return {
    id: check.id,
    label: check.label,
    points: check.points,
    passed: result.status === 0,
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - startedAt,
    command: [command, ...args],
    output: tail(result.error ? `${result.error.message}\n${output}` : output),
  }
}

function reportFilename(caseId) {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  return `${timestamp}__${caseId}.json`
}

function splitNullSeparated(value) {
  return value.split('\0').filter(Boolean)
}

function gitBuffer(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: null,
    maxBuffer: 50 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.toString().trim() || `git ${args.join(' ')} failed`,
    )
  }
  return result.stdout
}

function isProductionPath(file) {
  return !file.startsWith('tests/')
    && !file.startsWith('coverage/')
    && !file.startsWith('.agent-benchmark/')
    && file !== '.benchmark-task.md'
    && file !== '.benchmark-session.json'
}

function isFingerprintPath(file) {
  return file !== '.benchmark-task.md'
    && file !== '.benchmark-session.json'
    && !file.startsWith('node_modules/')
    && !file.startsWith('.agent-benchmark/')
}

export function candidateFingerprint({ benchmarkCase, repoRoot, workspace }) {
  const { target, baselineCommit, baselineTree } = assertPreparedWorkspace(
    benchmarkCase,
    repoRoot,
    workspace,
  )
  const trackedDiff = gitBuffer(target, [
    'diff',
    '--binary',
    '--full-index',
    baselineCommit,
    '--',
    '.',
    ':(exclude).benchmark-task.md',
    ':(exclude).benchmark-session.json',
  ])
  const untracked = gitBuffer(target, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter(isFingerprintPath)
    .toSorted()

  const hash = createHash('sha256')
  hash.update('paper-agent-benchmark-candidate-v1\0')
  hash.update(`${baselineTree}\0${trackedDiff.length}\0`)
  hash.update(trackedDiff)
  for (const file of untracked) {
    const path = containedPath(target, file)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) {
      throw new Error(`Candidate symlinks are not allowed: ${file}`)
    }
    if (!stat.isFile()) continue
    const content = readFileSync(path)
    hash.update(`${Buffer.byteLength(file)}\0${file}\0${content.length}\0`)
    hash.update(content)
  }
  return hash.digest('hex')
}

function changedFileCoverage(benchmarkCase, repoRoot, workspace, baselineCommit) {
  const tracked = splitNullSeparated(git(workspace, [
    'diff',
    '--no-renames',
    '--name-only',
    '-z',
    baselineCommit,
    '--',
    '.',
    ':(exclude).benchmark-task.md',
    ':(exclude).benchmark-session.json',
  ]))
  const untracked = splitNullSeparated(git(workspace, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ]))
  const candidate = new Set([...tracked, ...untracked].filter(isProductionPath))
  const reference = new Set(splitNullSeparated(run('git', [
    '-C',
    repoRoot,
    'diff',
    '--no-renames',
    '--name-only',
    '-z',
    benchmarkCase.baseCommit,
    benchmarkCase.referenceCommit,
    '--',
  ])).filter(isProductionPath))
  const matchedCount = [...candidate].filter(file => reference.has(file)).length
  const precision = candidate.size === 0 ? 0 : matchedCount / candidate.size
  const recall = reference.size === 0 ? 1 : matchedCount / reference.size
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

  return {
    candidateCount: candidate.size,
    referenceCount: reference.size,
    matchedCount,
    precision,
    recall,
    f1,
  }
}

function roundScore(value) {
  return Math.round(value * 10) / 10
}

function freezeCandidateWorkspace(workspace, destination) {
  cpSync(workspace, destination, {
    recursive: true,
    filter(source) {
      const path = relative(workspace, source)
      if (!path) return true
      return path.split(sep)[0] !== 'node_modules'
    },
  })
}

export function evaluateCase({
  benchmarkCase,
  repoRoot,
  workspace,
  resultsDirectory,
  keepEvaluation = false,
  revealCheckOutput = false,
}) {
  const { target: liveTarget } = assertPreparedWorkspace(benchmarkCase, repoRoot, workspace)
  const reports = resolve(resultsDirectory)
  if (reports === liveTarget || reports.startsWith(`${liveTarget}${sep}`)) {
    throw new Error('Results directory cannot be inside the candidate workspace')
  }
  const sourceDependencies = join(repoRoot, 'node_modules')
  if (!existsSync(sourceDependencies)) {
    throw new Error('Source node_modules is missing; run npm install before evaluation')
  }

  const evaluationParents = []
  const frozenParent = mkdtempSync(join(tmpdir(), 'paper-agent-benchmark-snapshot-'))
  const frozenWorkspace = join(frozenParent, 'candidate')
  let shouldClean = true

  try {
    const startedAt = new Date().toISOString()
    const startedMs = Date.now()
    freezeCandidateWorkspace(liveTarget, frozenWorkspace)
    const { target, baselineCommit } = assertPreparedWorkspace(
      benchmarkCase,
      repoRoot,
      frozenWorkspace,
    )
    const fingerprint = candidateFingerprint({
      benchmarkCase,
      repoRoot,
      workspace: target,
    })
    const changedFiles = changedFileCoverage(
      benchmarkCase,
      repoRoot,
      target,
      baselineCommit,
    )
    const dependencyModes = new Set()
    let oracleFileCount = 0
    const checkPriority = check => {
      if (check.kind === 'npm-script' && check.script === 'typecheck') return 0
      if (check.kind === 'npm-script' && check.script === 'build') return 1
      return 2
    }
    const orderedChecks = benchmarkCase.checks.toSorted((left, right) =>
      checkPriority(left) - checkPriority(right))
    const executedChecks = orderedChecks.map(check => {
      const checkParent = mkdtempSync(join(tmpdir(), 'paper-agent-benchmark-check-'))
      evaluationParents.push(checkParent)
      const checkRoot = join(checkParent, 'candidate')
      copyCandidateWorkspace(target, checkRoot)
      assertNoCandidateSymlinks(checkRoot)
      const oracleFiles = injectOracleFiles(benchmarkCase, repoRoot, checkRoot)
      oracleFileCount = Math.max(oracleFileCount, oracleFiles.length)
      dependencyModes.add(cloneDependencies(
        sourceDependencies,
        join(checkRoot, 'node_modules'),
      ))
      const result = executeCheck(check, checkRoot)
      if (!keepEvaluation) rmSync(checkParent, { recursive: true, force: true })
      return result
    })
    const checks = executedChecks.map(check => {
      if (revealCheckOutput) return check
      return {
        id: check.id,
        label: check.label,
        points: check.points,
        passed: check.passed,
        exitCode: check.exitCode,
        signal: check.signal,
        durationMs: check.durationMs,
        detailsHidden: true,
      }
    })
    const checkMaxScore = checks.reduce((total, check) => total + check.points, 0)
    const checkScore = checks.reduce((total, check) => total + (check.passed ? check.points : 0), 0)
    const maxScore = 100
    const score = roundScore(
      (checkScore / checkMaxScore) * 80 + changedFiles.f1 * 20,
    )

    mkdirSync(reports, { recursive: true })
    const reportFile = join(reports, reportFilename(benchmarkCase.id))
    const report = {
      schemaVersion: 1,
      caseId: benchmarkCase.id,
      title: benchmarkCase.title,
      workspace: liveTarget,
      candidateFingerprint: fingerprint,
      startedAt,
      durationMs: Date.now() - startedMs,
      score,
      maxScore,
      checks,
      scoring: {
        checks: { score: checkScore, maxScore: checkMaxScore, weight: 80 },
        changedFiles: { ...changedFiles, weight: 20 },
      },
      oracleFileCount,
      dependencyMode: [...dependencyModes].join(','),
      evaluationDirectory: keepEvaluation ? evaluationParents[0] ?? null : null,
      evaluationDirectories: keepEvaluation ? evaluationParents : [],
      reportFile,
    }
    writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`)
    if (keepEvaluation) shouldClean = false
    return report
  } finally {
    if (shouldClean) {
      for (const directory of evaluationParents) {
        rmSync(directory, { recursive: true, force: true })
      }
    }
    rmSync(frozenParent, { recursive: true, force: true })
  }
}

function applyReferencePatch(benchmarkCase, repoRoot, workspace) {
  const diff = spawnSync('git', [
    '-C',
    repoRoot,
    'diff',
    '--binary',
    '--full-index',
    benchmarkCase.baseCommit,
    benchmarkCase.referenceCommit,
    '--',
  ], {
    encoding: null,
    maxBuffer: 50 * 1024 * 1024,
  })
  if (diff.status !== 0) {
    throw new Error(diff.stderr?.toString().trim() || 'Could not create the reference patch')
  }

  const applied = spawnSync('git', ['apply', '--binary', '--whitespace=nowarn'], {
    cwd: workspace,
    input: diff.stdout,
    encoding: null,
    maxBuffer: 50 * 1024 * 1024,
  })
  if (applied.status !== 0) {
    throw new Error(applied.stderr?.toString().trim() || 'Could not apply the reference patch')
  }
}

export function evaluateReferenceCase({
  benchmarkCase,
  repoRoot,
  revealCheckOutput = false,
}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-agent-benchmark-gold-'))
  const workspace = join(temporaryRoot, 'workspace')

  try {
    prepareCase({
      benchmarkCase,
      repoRoot,
      workspace,
      linkDependencies: false,
    })
    applyReferencePatch(benchmarkCase, repoRoot, workspace)
    return evaluateCase({
      benchmarkCase,
      repoRoot,
      workspace,
      resultsDirectory: join(temporaryRoot, 'results'),
      revealCheckOutput,
    })
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

export function evaluateBaselineCase({
  benchmarkCase,
  repoRoot,
  revealCheckOutput = false,
}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'paper-agent-benchmark-baseline-'))
  const workspace = join(temporaryRoot, 'workspace')
  const behaviorCase = {
    ...benchmarkCase,
    checks: benchmarkCase.checks.filter(check => check.kind === 'vitest'),
  }

  try {
    prepareCase({
      benchmarkCase,
      repoRoot,
      workspace,
      linkDependencies: false,
    })
    return evaluateCase({
      benchmarkCase: behaviorCase,
      repoRoot,
      workspace,
      resultsDirectory: join(temporaryRoot, 'results'),
      revealCheckOutput,
    })
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}
