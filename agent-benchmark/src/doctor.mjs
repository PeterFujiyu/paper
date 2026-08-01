import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { validateManifest } from './catalog.mjs'
import { HARNESS_ROOT } from './paths.mjs'

function probe(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  return {
    available: result.status === 0,
    version: (result.stdout || result.stderr || '').trim().split('\n')[0],
  }
}

// BSD `cp` has no --version, so exit status says nothing about whether the binary exists. Only a
// failed spawn does. `cloneDependencies` shells out to `cp`, so its absence is a real failure.
function probePresence(command) {
  const result = spawnSync(command, [], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
  return { available: result.error?.code !== 'ENOENT', version: '' }
}

function gitStatus(root) {
  const result = spawnSync('git', ['-C', root, 'status', '--porcelain'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  // `git status` exits 128 in a bare or mirror clone. Folding that into `false` would report a
  // repository with no work tree as clean, which is a lie the split makes reachable.
  if (result.status !== 0) return null
  return result.stdout.trim().length > 0
}

/**
 * @param manifest     the parsed benchmarks.json
 * @param subjectRoot  the repository under test
 * @param harnessRoot  the repository holding the grading rules
 */
export function diagnoseEnvironment(manifest, subjectRoot, harnessRoot = HARNESS_ROOT) {
  const tools = {
    node: { available: true, version: process.version },
    git: probe('git', ['--version']),
    npm: probe('npm', ['--version']),
    tar: probe('tar', ['--version']),
    cp: probePresence('cp'),
  }
  const manifestResult = validateManifest(manifest, subjectRoot, harnessRoot)
  const dependencies = {
    available: existsSync(join(subjectRoot, 'node_modules')),
    path: join(subjectRoot, 'node_modules'),
  }
  // npm is reported but deliberately not gating: the checks invoke vitest/vue-tsc/vite through
  // process.execPath directly (engine.mjs), so a missing npm would fail doctor for a tool the
  // harness never runs.
  const requiredTools = ['node', 'git', 'tar', 'cp']
  const ready = requiredTools.every(name => tools[name].available)
    && manifestResult.valid
    && dependencies.available

  const subjectDirty = gitStatus(subjectRoot)
  const harnessDirty = gitStatus(harnessRoot)

  return {
    ready,
    sourceRepository: subjectRoot,
    harnessRepository: harnessRoot,
    // null means "could not be determined" — a work-tree-less clone, not a clean one.
    sourceDirty: subjectDirty,
    // Post-split the status check above runs against the subject, so without this probe the
    // signal that would notice a locally-edited grading rule disappears entirely.
    harnessDirty,
    tools,
    dependencies,
    manifest: manifestResult,
  }
}
